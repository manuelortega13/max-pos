package com.maxpos.product.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * A single incoming shipment (batch) of a product.
 *  - quantity: required, positive
 *  - expiryDate: optional (e.g. dry goods never expire)
 *  - costPerUnit: optional; if supplied, overrides the product's default cost
 *                 for this batch's valuation
 *  - note: freeform, e.g. invoice reference
 */
public record RestockRequest(
        @NotNull @Min(1) Integer quantity,
        LocalDate expiryDate,
        @DecimalMin("0.00") BigDecimal costPerUnit,
        @Size(max = 2048) String note
) {}
