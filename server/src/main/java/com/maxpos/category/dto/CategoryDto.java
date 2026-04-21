package com.maxpos.category.dto;

import com.maxpos.category.Category;

import java.util.UUID;

public record CategoryDto(
        UUID id,
        String name,
        String description,
        String color,
        String icon
) {
    public static CategoryDto from(Category c) {
        return new CategoryDto(c.getId(), c.getName(), c.getDescription(), c.getColor(), c.getIcon());
    }
}
