package com.maxpos.gcash;

import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.gcash.dto.GcashFeeTierDto;
import com.maxpos.gcash.dto.GcashFeeTierUpsertRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class GcashFeeTierService {

    private static final Sort BY_MIN = Sort.by(Sort.Order.asc("minAmount"));

    private final GcashFeeTierRepository tiers;

    public GcashFeeTierService(GcashFeeTierRepository tiers) {
        this.tiers = tiers;
    }

    public List<GcashFeeTierDto> list() {
        return tiers.findAll(BY_MIN).stream().map(GcashFeeTierDto::from).toList();
    }

    public GcashFeeTierDto get(UUID id) {
        return tiers.findById(id).map(GcashFeeTierDto::from)
                .orElseThrow(() -> new NotFoundException("Fee tier not found"));
    }

    /**
     * Active tier matching an amount. The boundary rule is
     * {@code min ≤ amount ≤ max} — closed range on both ends so
     * "501–1000" includes both 501 and 1000. Overlap validation on
     * insert/update prevents endpoint conflicts (e.g. [1,500] +
     * [500,1000] both containing 500). Returns empty when no
     * active tier covers the amount — the UI surfaces that to the
     * cashier and falls back to manual fee entry.
     */
    public Optional<GcashFeeTierDto> lookup(BigDecimal amount) {
        if (amount == null || amount.signum() < 0) return Optional.empty();
        return tiers
                .findFirstByActiveTrueAndMinAmountLessThanEqualAndMaxAmountGreaterThanEqualOrderByMinAmount(amount, amount)
                .map(GcashFeeTierDto::from);
    }

    @Transactional
    public GcashFeeTierDto create(GcashFeeTierUpsertRequest req) {
        validateRange(req);
        if (req.active()) rejectOverlap(req, /* excludeId */ null);
        GcashFeeTier t = new GcashFeeTier();
        apply(t, req);
        return GcashFeeTierDto.from(tiers.save(t));
    }

    @Transactional
    public GcashFeeTierDto update(UUID id, GcashFeeTierUpsertRequest req) {
        GcashFeeTier t = tiers.findById(id)
                .orElseThrow(() -> new NotFoundException("Fee tier not found"));
        validateRange(req);
        if (req.active()) rejectOverlap(req, id);
        apply(t, req);
        return GcashFeeTierDto.from(t);
    }

    @Transactional
    public void delete(UUID id) {
        if (!tiers.existsById(id)) throw new NotFoundException("Fee tier not found");
        // Tier rows aren't FK-referenced anywhere — transactions
        // store the fee at the row level, so deleting a tier doesn't
        // break history. Hard delete is safe.
        tiers.deleteById(id);
    }

    private void apply(GcashFeeTier t, GcashFeeTierUpsertRequest req) {
        t.setMinAmount(req.minAmount());
        t.setMaxAmount(req.maxAmount());
        t.setFee(req.fee());
        t.setActive(req.active());
    }

    private void validateRange(GcashFeeTierUpsertRequest req) {
        if (req.maxAmount().compareTo(req.minAmount()) <= 0) {
            throw new ConflictException("Max amount must be greater than min amount.");
        }
    }

    /**
     * Reject when the proposed range overlaps an existing active
     * tier (excluding the row being updated, if any). Two closed
     * ranges [a,b] and [c,d] overlap iff a ≤ d AND c ≤ b. This
     * rejects endpoint contiguity ([1,500] + [500,1000] both
     * contain 500), forcing the admin to use [1,499] + [500,1000]
     * or [1,500] + [501,1000] instead.
     */
    private void rejectOverlap(GcashFeeTierUpsertRequest req, UUID excludeId) {
        for (GcashFeeTier other : tiers.findAllByActiveTrueOrderByMinAmount()) {
            if (excludeId != null && other.getId().equals(excludeId)) continue;
            boolean overlap = req.minAmount().compareTo(other.getMaxAmount()) <= 0
                           && other.getMinAmount().compareTo(req.maxAmount()) <= 0;
            if (overlap) {
                throw new ConflictException(
                        "Range overlaps an existing active tier (" +
                        other.getMinAmount() + "–" + other.getMaxAmount() + ").");
            }
        }
    }
}
