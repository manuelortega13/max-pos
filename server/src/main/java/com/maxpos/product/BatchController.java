package com.maxpos.product;

import com.maxpos.product.dto.ExpiringBatchDto;
import com.maxpos.product.dto.ProductBatchDto;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Batch-scoped operations. Endpoints live under /api/batches/* so they stay
 * findable without nesting every action under /api/products/{id}/batches/{bid}.
 */
@RestController
@RequestMapping("/api/batches")
public class BatchController {

    private final ProductService productService;

    public BatchController(ProductService productService) {
        this.productService = productService;
    }

    /**
     * Batches whose expiry is within `withinDays` days from today (including
     * anything already expired). Used by the admin notification bell and
     * dashboard. Any authenticated user can read.
     */
    @GetMapping("/expiring")
    public List<ExpiringBatchDto> expiring(
            @RequestParam(defaultValue = "30") int withinDays
    ) {
        return productService.listExpiring(withinDays);
    }

    @PostMapping("/{id}/writeoff")
    @PreAuthorize("hasRole('ADMIN')")
    public ProductBatchDto writeOff(@PathVariable UUID id) {
        return productService.writeOffBatch(id);
    }
}
