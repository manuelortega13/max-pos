package com.maxpos.category;

import com.maxpos.category.dto.CategoryDto;
import com.maxpos.category.dto.CategoryUpsertRequest;
import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class CategoryService {

    private final CategoryRepository repo;

    public CategoryService(CategoryRepository repo) {
        this.repo = repo;
    }

    public List<CategoryDto> list() {
        return repo.findAll().stream().map(CategoryDto::from).toList();
    }

    public CategoryDto get(UUID id) {
        return repo.findById(id).map(CategoryDto::from)
                .orElseThrow(() -> new NotFoundException("Category not found"));
    }

    @Transactional
    public CategoryDto create(CategoryUpsertRequest req) {
        if (repo.existsByNameIgnoreCase(req.name())) {
            throw new ConflictException("Category name already exists");
        }
        Category c = new Category();
        apply(c, req);
        return CategoryDto.from(repo.save(c));
    }

    @Transactional
    public CategoryDto update(UUID id, CategoryUpsertRequest req) {
        Category c = repo.findById(id)
                .orElseThrow(() -> new NotFoundException("Category not found"));
        apply(c, req);
        return CategoryDto.from(c);
    }

    @Transactional
    public void delete(UUID id) {
        if (!repo.existsById(id)) throw new NotFoundException("Category not found");
        repo.deleteById(id);
    }

    private void apply(Category c, CategoryUpsertRequest req) {
        c.setName(req.name());
        c.setDescription(req.description());
        c.setColor(req.color());
        c.setIcon(req.icon());
    }
}
