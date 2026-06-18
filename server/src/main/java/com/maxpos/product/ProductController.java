package com.maxpos.product;

import com.maxpos.common.PageResponse;
import com.maxpos.product.dto.InventoryStatsDto;
import com.maxpos.product.dto.ProductBatchDto;
import com.maxpos.product.dto.ProductDto;
import com.maxpos.product.dto.ProductUpsertRequest;
import com.maxpos.product.dto.RestockRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductService service;

    public ProductController(ProductService service) {
        this.service = service;
    }

    @GetMapping
    public List<ProductDto> list(
            @RequestParam Optional<UUID> categoryId,
            @RequestParam(defaultValue = "false") boolean activeOnly
    ) {
        return service.list(categoryId, Optional.of(activeOnly));
    }

    /** Paged + filtered view backing the admin Products table. Admin-only;
     *  the full {@code list} above still serves the POS and other callers. */
    @GetMapping("/page")
    @PreAuthorize("hasRole('ADMIN')")
    public PageResponse<ProductDto> page(
            @RequestParam Optional<UUID> categoryId,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        return service.page(categoryId, search, page, size);
    }

    /** Paged + filtered view for the admin Inventory table (adds a stock-
     *  status filter). Admin-only. */
    @GetMapping("/inventory")
    @PreAuthorize("hasRole('ADMIN')")
    public PageResponse<ProductDto> inventory(
            @RequestParam Optional<UUID> categoryId,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String stock,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        return service.inventoryPage(categoryId, search, stock, page, size);
    }

    /** Whole-catalog inventory summary for the page's top cards. Admin-only. */
    @GetMapping("/inventory/summary")
    @PreAuthorize("hasRole('ADMIN')")
    public InventoryStatsDto inventorySummary() {
        return service.inventorySummary();
    }

    /** Full (non-paged) filtered set for the printable inventory / low-stock
     *  sheets. Admin-only. */
    @GetMapping("/inventory/export")
    @PreAuthorize("hasRole('ADMIN')")
    public List<ProductDto> inventoryExport(
            @RequestParam Optional<UUID> categoryId,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String stock,
            @RequestParam(defaultValue = "false") boolean activeOnly
    ) {
        return service.inventoryExport(categoryId, search, stock, activeOnly);
    }

    @GetMapping("/{id}")
    public ProductDto get(@PathVariable UUID id) {
        return service.get(id);
    }

    @GetMapping("/barcode/{barcode}")
    public ProductDto byBarcode(@PathVariable String barcode) {
        return service.findByBarcode(barcode);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public ProductDto create(@Valid @RequestBody ProductUpsertRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ProductDto update(@PathVariable UUID id, @Valid @RequestBody ProductUpsertRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }

    @PostMapping("/{id}/restock")
    @PreAuthorize("hasRole('ADMIN')")
    public ProductDto restock(@PathVariable UUID id, @Valid @RequestBody RestockRequest req) {
        return service.restock(id, req);
    }

    @GetMapping("/{id}/batches")
    public List<ProductBatchDto> batches(@PathVariable UUID id) {
        return service.listBatches(id);
    }
}
