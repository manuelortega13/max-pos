package com.maxpos.creditor;

import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.creditor.dto.CreditorDto;
import com.maxpos.creditor.dto.CreditorUpsertRequest;
import com.maxpos.sale.SaleRepository;
import com.maxpos.sale.dto.SaleDto;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class CreditorService {

    private static final Sort NAME_ASC = Sort.by(Sort.Order.asc("fullName"));

    private final CreditorRepository creditors;
    private final SaleRepository sales;

    public CreditorService(CreditorRepository creditors, SaleRepository sales) {
        this.creditors = creditors;
        this.sales = sales;
    }

    /** Every sale ever charged to this creditor, newest first. Used
     *  by the admin Creditors page to drill into a creditor's
     *  purchase history. Returns the standard SaleDto so the same
     *  SaleItemsDialog component renders the line items. */
    public List<SaleDto> listSales(UUID creditorId) {
        if (!creditors.existsById(creditorId)) {
            throw new NotFoundException("Creditor not found");
        }
        return sales.findAllByCreditorIdOrderByDateDesc(creditorId).stream()
                .map(SaleDto::from).toList();
    }

    public List<CreditorDto> list() {
        return creditors.findAll(NAME_ASC).stream().map(CreditorDto::from).toList();
    }

    public List<CreditorDto> listActive() {
        return creditors.findAllByActiveTrue(NAME_ASC).stream().map(CreditorDto::from).toList();
    }

    public CreditorDto get(UUID id) {
        return creditors.findById(id).map(CreditorDto::from)
                .orElseThrow(() -> new NotFoundException("Creditor not found"));
    }

    @Transactional
    public CreditorDto create(CreditorUpsertRequest req) {
        Creditor c = new Creditor();
        apply(c, req);
        return CreditorDto.from(creditors.save(c));
    }

    @Transactional
    public CreditorDto update(UUID id, CreditorUpsertRequest req) {
        Creditor c = creditors.findById(id)
                .orElseThrow(() -> new NotFoundException("Creditor not found"));
        apply(c, req);
        return CreditorDto.from(c);
    }

    /**
     * Hard-delete a creditor. Rejects with 409 when the creditor has
     * sales history — the FK from sales.creditor_id has no ON DELETE
     * action set (RESTRICT default), so the row can't be dropped
     * anyway. Surfaces the constraint as a friendly message and
     * suggests deactivation, mirroring the product-delete behaviour.
     */
    @Transactional
    public void delete(UUID id) {
        Creditor c = creditors.findById(id)
                .orElseThrow(() -> new NotFoundException("Creditor not found"));
        // Outstanding balance > 0 OR any historical sale (even refunded)
        // means the creditor is linked to a sales row. The @Formula only
        // sums unrefunded sales, but the FK exists either way — we'd
        // rather give the friendly message than let the DB throw.
        if (c.getOutstandingBalance() != null && c.getOutstandingBalance().signum() > 0) {
            throw new ConflictException(
                    "Cannot delete \"" + c.getFullName() + "\" — they have an outstanding balance of "
                    + c.getOutstandingBalance() + ". Settle first or deactivate instead.");
        }
        // Even with zero balance, an FK to a refunded sale would block
        // the delete. Catch via a generic try/catch so we can convert.
        try {
            creditors.delete(c);
        } catch (org.springframework.dao.DataIntegrityViolationException ex) {
            throw new ConflictException(
                    "Cannot delete \"" + c.getFullName() + "\" — they have sales history. Deactivate instead.");
        }
    }

    private void apply(Creditor c, CreditorUpsertRequest req) {
        c.setFullName(req.fullName().trim());
        c.setPhone(req.phone().trim());
        c.setAddress(req.address() == null || req.address().isBlank() ? null : req.address().trim());
        c.setPaymentTerm(req.paymentTerm());
        c.setCreditLimit(normalizeLimit(req.creditLimit()));
        c.setActive(req.active());
    }

    /** Treat a 0 limit as 0 (intentional "no credit"), not as null. */
    private BigDecimal normalizeLimit(BigDecimal raw) {
        return raw;
    }
}
