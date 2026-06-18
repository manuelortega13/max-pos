package com.maxpos.transaction;

import com.maxpos.common.PageResponse;
import com.maxpos.transaction.dto.TransactionRowDto;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Unified, server-paginated transaction feed for the admin Sales page.
 * Merges sales + GCash + load (via the {@code transaction_feed} view)
 * so the page fetches only the rows it shows instead of pulling every
 * transaction and merging client-side.
 */
@RestController
@RequestMapping("/api/transactions")
public class TransactionController {

    private final TransactionFeedService service;

    public TransactionController(TransactionFeedService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public PageResponse<TransactionRowDto> list(
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) UUID cashierId,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return service.query(source, status, cashierId, search, page, size);
    }
}
