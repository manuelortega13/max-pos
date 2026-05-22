package com.maxpos.businessday;

import com.maxpos.businessday.dto.BusinessDayDto;
import com.maxpos.businessday.dto.CloseDayRequest;
import com.maxpos.businessday.dto.OpenDayRequest;
import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
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
    private final UserRepository users;

    public BusinessDayService(BusinessDayRepository days,
                              SaleRepository sales,
                              UserRepository users) {
        this.days = days;
        this.sales = sales;
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
        int salesCount = 0;
        int itemsSold = 0;

        for (Sale s : windowSales) {
            BigDecimal t = s.getTotal();
            if (s.getStatus() == SaleStatus.REFUNDED) {
                totalRefunds = totalRefunds.add(t);
                if (s.getPaymentMethod() == PaymentMethod.CASH) {
                    cashRefunds = cashRefunds.add(t);
                }
                continue;
            }
            // COMPLETED (and any future PENDING) counts toward sales.
            totalSales = totalSales.add(t);
            salesCount++;
            itemsSold += s.getItems().stream().mapToInt(i -> i.getQuantity()).sum();
            switch (s.getPaymentMethod()) {
                case CASH -> cashSales = cashSales.add(t);
                case CARD -> cardSales = cardSales.add(t);
                case TRANSFER -> transferSales = transferSales.add(t);
            }
        }

        BigDecimal expectedCash = d.getOpeningFloat().add(cashSales).subtract(cashRefunds);
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
        d.setSalesCount(salesCount);
        d.setItemsSold(itemsSold);
        return BusinessDayDto.from(d);
    }
}
