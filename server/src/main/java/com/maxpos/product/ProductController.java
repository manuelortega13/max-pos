package com.maxpos.product;

import com.maxpos.product.dto.ProductDto;
import com.maxpos.product.dto.ProductUpsertRequest;
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
}
