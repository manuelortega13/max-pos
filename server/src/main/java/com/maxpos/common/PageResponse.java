package com.maxpos.common;

import org.springframework.data.domain.Page;

import java.util.List;
import java.util.function.Function;

/**
 * Stable JSON envelope for a page of results, shared across features.
 * We return this instead of Spring Data's {@code Page}/{@code PageImpl}
 * because the latter's serialized form is explicitly unstable across
 * versions (Boot logs a warning when it's serialized directly).
 */
public record PageResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages
) {
    /** Map a Spring Data {@link Page} of entities to a DTO page envelope. */
    public static <E, T> PageResponse<T> of(Page<E> page, Function<E, T> mapper) {
        return new PageResponse<>(
                page.getContent().stream().map(mapper).toList(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages()
        );
    }
}
