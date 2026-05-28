package com.maxpos.load;

import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.load.dto.LoadFeeTierDto;
import com.maxpos.load.dto.LoadFeeTierUpsertRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class LoadFeeTierService {

    private static final Sort BY_MIN = Sort.by(Sort.Order.asc("minAmount"));

    private final LoadFeeTierRepository tiers;

    public LoadFeeTierService(LoadFeeTierRepository tiers) {
        this.tiers = tiers;
    }

    public List<LoadFeeTierDto> list() {
        return tiers.findAll(BY_MIN).stream().map(LoadFeeTierDto::from).toList();
    }

    public LoadFeeTierDto get(UUID id) {
        return tiers.findById(id).map(LoadFeeTierDto::from)
                .orElseThrow(() -> new NotFoundException("Fee tier not found"));
    }

    /** Active tier matching an amount. Closed range on both ends —
     *  {@code min ≤ amount ≤ max} — so "501–1000" matches 501 and
     *  1000. Overlap validation prevents endpoint conflicts. */
    public Optional<LoadFeeTierDto> lookup(BigDecimal amount) {
        if (amount == null || amount.signum() < 0) return Optional.empty();
        return tiers
                .findFirstByActiveTrueAndMinAmountLessThanEqualAndMaxAmountGreaterThanEqualOrderByMinAmount(amount, amount)
                .map(LoadFeeTierDto::from);
    }

    @Transactional
    public LoadFeeTierDto create(LoadFeeTierUpsertRequest req) {
        validateRange(req);
        if (req.active()) rejectOverlap(req, null);
        LoadFeeTier t = new LoadFeeTier();
        apply(t, req);
        return LoadFeeTierDto.from(tiers.save(t));
    }

    @Transactional
    public LoadFeeTierDto update(UUID id, LoadFeeTierUpsertRequest req) {
        LoadFeeTier t = tiers.findById(id)
                .orElseThrow(() -> new NotFoundException("Fee tier not found"));
        validateRange(req);
        if (req.active()) rejectOverlap(req, id);
        apply(t, req);
        return LoadFeeTierDto.from(t);
    }

    @Transactional
    public void delete(UUID id) {
        if (!tiers.existsById(id)) throw new NotFoundException("Fee tier not found");
        // Tier rows aren't FK-referenced anywhere — load_transactions
        // captures the fee at the row level, so deleting a tier
        // doesn't break history.
        tiers.deleteById(id);
    }

    private void apply(LoadFeeTier t, LoadFeeTierUpsertRequest req) {
        t.setMinAmount(req.minAmount());
        t.setMaxAmount(req.maxAmount());
        t.setFee(req.fee());
        t.setActive(req.active());
    }

    private void validateRange(LoadFeeTierUpsertRequest req) {
        if (req.maxAmount().compareTo(req.minAmount()) <= 0) {
            throw new ConflictException("Max amount must be greater than min amount.");
        }
    }

    /**
     * Reject when the proposed range overlaps an existing active
     * tier (excluding the row being updated, if any). Two closed
     * ranges [a,b] and [c,d] overlap iff a ≤ d AND c ≤ b — this
     * rejects endpoint contiguity ([1,500] + [500,1000] both
     * contain 500), forcing the admin to use [1,499] + [500,1000]
     * or [1,500] + [501,1000] instead.
     */
    private void rejectOverlap(LoadFeeTierUpsertRequest req, UUID excludeId) {
        for (LoadFeeTier other : tiers.findAllByActiveTrueOrderByMinAmount()) {
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
