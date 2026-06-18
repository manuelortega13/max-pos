package com.maxpos.product;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProductRepository extends JpaRepository<Product, UUID> {
    Optional<Product> findBySkuIgnoreCase(String sku);
    List<Product> findAllByActiveTrue(Sort sort);
    List<Product> findAllByCategoryId(UUID categoryId, Sort sort);
    boolean existsBySkuIgnoreCase(String sku);

    /** Scan-code lookup. Joins through product_barcodes since codes
     *  no longer live on the products table itself. */
    @Query("SELECT b.product FROM ProductBarcode b WHERE b.code = :code")
    Optional<Product> findByBarcode(@Param("code") String code);

    /**
     * One filtered, sorted, paginated page for the admin Products table.
     * Barcode matching uses an {@code exists} subquery rather than a join
     * so a product with many codes isn't duplicated across rows (which
     * would also break offset paging). {@code categoryId} is optional —
     * null disables the predicate and infers its type from the column.
     * {@code term} must be a non-null, pre-lowercased string ("" = no
     * search): a null parameter inside a {@code like}/{@code concat} has
     * no column to take its type from, so PgJDBC binds it as {@code bytea}
     * and the query fails ("operator does not exist: text ~~ bytea").
     */
    @Query("""
            select p from Product p
            where (:categoryId is null or p.category.id = :categoryId)
              and (:term = ''
                   or lower(p.name) like concat('%', :term, '%')
                   or lower(p.sku) like concat('%', :term, '%')
                   or exists (select 1 from ProductBarcode b
                              where b.product = p and lower(b.code) like concat('%', :term, '%')))
            """)
    Page<Product> search(@Param("categoryId") UUID categoryId,
                         @Param("term") String term,
                         Pageable pageable);

    /**
     * One page for the admin Inventory table. Same name/SKU/barcode +
     * category filtering as {@link #search}, plus a stock-status filter
     * applied to the {@code @Formula}-computed {@code stock} (Hibernate
     * inlines the formula subquery in the predicate):
     *   ALL = no filter · LOW = 1..5 · OUT = ≤ 0 (incl. oversold) · OK = > 5.
     * {@code stock} and {@code term} are never null (callers pass "ALL" / "").
     */
    @Query("""
            select p from Product p
            where (:categoryId is null or p.category.id = :categoryId)
              and (:term = ''
                   or lower(p.name) like concat('%', :term, '%')
                   or lower(p.sku) like concat('%', :term, '%')
                   or exists (select 1 from ProductBarcode b
                              where b.product = p and lower(b.code) like concat('%', :term, '%')))
              and (:stock = 'ALL'
                   or (:stock = 'LOW' and p.stock > 0 and p.stock <= 5)
                   or (:stock = 'OUT' and p.stock <= 0)
                   or (:stock = 'OK'  and p.stock > 5))
            """)
    Page<Product> searchInventory(@Param("categoryId") UUID categoryId,
                                  @Param("term") String term,
                                  @Param("stock") String stock,
                                  Pageable pageable);

    /**
     * Non-paged twin of {@link #searchInventory} for the printable sheets,
     * which need the whole matching set (not one page). Adds an optional
     * {@code activeOnly} gate — the low-stock restocking run only lists
     * active SKUs.
     */
    @Query("""
            select p from Product p
            where (:categoryId is null or p.category.id = :categoryId)
              and (:term = ''
                   or lower(p.name) like concat('%', :term, '%')
                   or lower(p.sku) like concat('%', :term, '%')
                   or exists (select 1 from ProductBarcode b
                              where b.product = p and lower(b.code) like concat('%', :term, '%')))
              and (:stock = 'ALL'
                   or (:stock = 'LOW' and p.stock > 0 and p.stock <= 5)
                   or (:stock = 'OUT' and p.stock <= 0)
                   or (:stock = 'OK'  and p.stock > 5))
              and (:activeOnly = false or p.active = true)
            """)
    List<Product> findInventoryForExport(@Param("categoryId") UUID categoryId,
                                         @Param("term") String term,
                                         @Param("stock") String stock,
                                         @Param("activeOnly") boolean activeOnly,
                                         Sort sort);
}
