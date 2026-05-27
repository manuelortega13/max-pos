package com.maxpos.businessday;

import com.maxpos.businessday.dto.BusinessDayDto;
import com.maxpos.businessday.dto.CloseDayRequest;
import com.maxpos.businessday.dto.OpenDayRequest;
import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.creditor.CreditorPayment;
import com.maxpos.creditor.CreditorPaymentRepository;
import com.maxpos.gcash.GcashTransaction;
import com.maxpos.gcash.GcashTransactionRepository;
import com.maxpos.gcash.GcashTransactionType;
import com.maxpos.load.LoadTransaction;
import com.maxpos.load.LoadTransactionRepository;
import com.maxpos.sale.PaymentMethod;
import com.maxpos.sale.Sale;
import com.maxpos.sale.SaleRepository;
import com.maxpos.sale.SaleStatus;
import com.maxpos.user.User;
import com.maxpos.user.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Open-close lifecycle for the global business day. Snapshot totals
 * (sales by payment method, refunds, expected cash, variance) are
 * computed here at close time and frozen onto the BusinessDay row so
 * the Z-report stays stable even if individual sales are later refunded.
 */
@Service
@Transactional(readOnly = true)
public class BusinessDayService {

    private final BusinessDayRepository days;
    private final SaleRepository sales;
    private final CreditorPaymentRepository creditorPayments;
    private final GcashTransactionRepository gcashTransactions;
    private final LoadTransactionRepository loadTransactions;
    private final UserRepository users;

    public BusinessDayService(BusinessDayRepository days,
                              SaleRepository sales,
                              CreditorPaymentRepository creditorPayments,
                              GcashTransactionRepository gcashTransactions,
                              LoadTransactionRepository loadTransactions,
                              UserRepository users) {
        this.days = days;
        this.sales = sales;
        this.creditorPayments = creditorPayments;
        this.gcashTransactions = gcashTransactions;
        this.loadTransactions = loadTransactions;
        this.users = users;
    }

    public Optional<BusinessDayDto> current() {
        return days.findFirstByClosedAtIsNull().map(BusinessDayDto::from);
    }

    public List<BusinessDayDto> list() {
        return days.findAllByOrderByOpenedAtDesc().stream().map(BusinessDayDto::from).toList();
    }

    public BusinessDayDto get(UUID id) {
        return days.findById(id).map(BusinessDayDto::from)
                .orElseThrow(() -> new NotFoundException("Business day not found"));
    }

    @Transactional
    public BusinessDayDto open(OpenDayRequest req, UUID openerId) {
        if (days.findFirstByClosedAtIsNull().isPresent()) {
            throw new ConflictException("A business day is already open");
        }
        User opener = users.findById(openerId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        BusinessDay d = new BusinessDay();
        d.setOpenedAt(Instant.now());
        d.setOpenedBy(opener);
        d.setOpeningFloat(req.openingFloat());
        return BusinessDayDto.from(days.save(d));
    }

    @Transactional
    public BusinessDayDto close(CloseDayRequest req, UUID closerId) {
        BusinessDay d = days.findFirstByClosedAtIsNull()
                .orElseThrow(() -> new ConflictException("No business day is open"));
        User closer = users.findById(closerId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        Instant closedAt = Instant.now();

        // Aggregate by FK — only sales explicitly attached to this day count.
        // Offline replays that arrived between open and close also carry this
        // FK; pre-feature sales (business_day_id = NULL) are correctly ignored.
        List<Sale> windowSales = sales.findAllByBusinessDayId(d.getId());

        BigDecimal totalSales = BigDecimal.ZERO;
        BigDecimal totalRefunds = BigDecimal.ZERO;
        BigDecimal cashSales = BigDecimal.ZERO;
        BigDecimal cashRefunds = BigDecimal.ZERO;
        BigDecimal cardSales = BigDecimal.ZERO;
        BigDecimal transferSales = BigDecimal.ZERO;
        BigDecimal creditSales = BigDecimal.ZERO;
        BigDecimal cashCreditPayments = BigDecimal.ZERO;
        BigDecimal gcashCashInAmount = BigDecimal.ZERO;
        BigDecimal gcashCashInFees = BigDecimal.ZERO;
        BigDecimal gcashCashOutAmount = BigDecimal.ZERO;
        BigDecimal gcashCashOutFees = BigDecimal.ZERO;
        BigDecimal loadAmount = BigDecimal.ZERO;
        BigDecimal loadFees = BigDecimal.ZERO;
        int salesCount = 0;
        int itemsSold = 0;

        // Gross accounting: every sale that rang up during the day
        // counts toward the sales totals — refunds are reported as a
        // separate offsetting line. This matches the physical cash-
        // drawer flow: cash came IN when the sale rang, then went OUT
        // when the refund was issued, so both events must be counted.
        // Earlier draft skipped refunded sales from cashSales but still
        // added their amount to cashRefunds, producing a negative
        // expectedCash whenever refunds exceeded same-day completed
        // cash sales (e.g. 3 cash sales, 2 refunded later that day).
        for (Sale s : windowSales) {
            BigDecimal t = s.getTotal();
            boolean refunded = s.getStatus() == SaleStatus.REFUNDED;

            totalSales = totalSales.add(t);
            salesCount++;
            itemsSold += s.getItems().stream().mapToInt(i -> i.getQuantity()).sum();
            switch (s.getPaymentMethod()) {
                case CASH -> cashSales = cashSales.add(t);
                case CARD -> cardSales = cardSales.add(t);
                case TRANSFER -> transferSales = transferSales.add(t);
                case CREDIT -> creditSales = creditSales.add(t);
            }
            if (refunded) {
                totalRefunds = totalRefunds.add(t);
                // Card / transfer refunds don't touch the cash drawer
                // (the customer's bank pulls the money back out of the
                // settlement account), so they don't enter the cash
                // reconciliation math.
                if (s.getPaymentMethod() == PaymentMethod.CASH) {
                    cashRefunds = cashRefunds.add(t);
                }
            }
        }

        // Cash credit payments add to the till — sum the day's
        // non-voided payments. Card / transfer payments don't enter
        // the cash drawer math, only the snapshot total per method.
        for (CreditorPayment p : creditorPayments.findAllByBusinessDayId(d.getId())) {
            if (p.getVoidedAt() != null) continue;
            if (p.getPaymentMethod() == PaymentMethod.CASH) {
                cashCreditPayments = cashCreditPayments.add(p.getAmount());
            }
        }

        // GCash service transactions. Cash-in: customer hands cash,
        // we send GCash → drawer gains amount + fee. Cash-out:
        // customer sends GCash, we hand cash → drawer loses amount,
        // keeps fee. Voided rows are excluded — they didn't happen.
        for (GcashTransaction g : gcashTransactions.findAllByBusinessDayId(d.getId())) {
            if (g.getVoidedAt() != null) continue;
            if (g.getType() == GcashTransactionType.CASH_IN) {
                gcashCashInAmount = gcashCashInAmount.add(g.getAmount());
                gcashCashInFees   = gcashCashInFees.add(g.getFee());
            } else {
                gcashCashOutAmount = gcashCashOutAmount.add(g.getAmount());
                gcashCashOutFees   = gcashCashOutFees.add(g.getFee());
            }
        }

        // Load transactions are always cash-in for the till: customer
        // hands cash, store sends mobile load. Drawer gains amount +
        // fee. Voided rows excluded (same rule as GCash).
        for (LoadTransaction l : loadTransactions.findAllByBusinessDayId(d.getId())) {
            if (l.getVoidedAt() != null) continue;
            loadAmount = loadAmount.add(l.getAmount());
            loadFees   = loadFees.add(l.getFee());
        }

        BigDecimal expectedCash = d.getOpeningFloat()
                .add(cashSales)
                .add(cashCreditPayments)
                .add(gcashCashInAmount)
                .add(gcashCashInFees)
                .add(gcashCashOutFees)
                .add(loadAmount)
                .add(loadFees)
                .subtract(cashRefunds)
                .subtract(gcashCashOutAmount);
        BigDecimal variance = req.countedCash().subtract(expectedCash);

        d.setClosedAt(closedAt);
        d.setClosedBy(closer);
        d.setCountedCash(req.countedCash());
        d.setNotes(req.notes() == null || req.notes().isBlank() ? null : req.notes().trim());
        d.setExpectedCash(expectedCash);
        d.setVariance(variance);
        d.setTotalSales(totalSales);
        d.setTotalRefunds(totalRefunds);
        d.setCashSales(cashSales);
        d.setCashRefunds(cashRefunds);
        d.setCardSales(cardSales);
        d.setTransferSales(transferSales);
        d.setCreditSales(creditSales);
        d.setCashCreditPayments(cashCreditPayments);
        d.setGcashCashInAmount(gcashCashInAmount);
        d.setGcashCashInFees(gcashCashInFees);
        d.setGcashCashOutAmount(gcashCashOutAmount);
        d.setGcashCashOutFees(gcashCashOutFees);
        d.setLoadAmount(loadAmount);
        d.setLoadFees(loadFees);
        d.setSalesCount(salesCount);
        d.setItemsSold(itemsSold);
        return BusinessDayDto.from(d);
    }
}
