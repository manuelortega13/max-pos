package com.maxpos.sale;

import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.notification.NotificationEvent;
import com.maxpos.notification.NotificationPublisher;
import com.maxpos.product.Product;
import com.maxpos.product.ProductBatch;
import com.maxpos.product.ProductBatchRepository;
import com.maxpos.product.ProductRepository;
import com.maxpos.product.ProductService;
import com.maxpos.sale.dto.CreateSaleRequest;
import com.maxpos.sale.dto.SaleDto;
import com.maxpos.settings.StoreSettings;
import com.maxpos.settings.StoreSettingsRepository;
import com.maxpos.user.User;
import com.maxpos.user.UserRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

@Service
@Transactional(readOnly = true)
public class SaleService {

    private final SaleRepository sales;
    private final ProductRepository products;
    private final ProductBatchRepository batches;
    private final ProductService productService;
    private final UserRepository users;
    private final StoreSettingsRepository settings;
    private final NotificationPublisher notifications;

    public SaleService(SaleRepository sales,
                       ProductRepository products,
                       ProductBatchRepository batches,
                       ProductService productService,
                       UserRepository users,
                       StoreSettingsRepository settings,
                       NotificationPublisher notifications) {
        this.sales = sales;
        this.products = products;
        this.batches = batches;
        this.productService = productService;
        this.users = users;
        this.settings = settings;
        this.notifications = notifications;
    }

    public List<SaleDto> list() {
        return sales.findAllByOrderByDateDesc().stream().map(SaleDto::from).toList();
    }

    public List<SaleDto> listByCashier(UUID cashierId) {
        return sales.findAllByCashierIdOrderByDateDesc(cashierId).stream().map(SaleDto::from).toList();
    }

    public SaleDto get(UUID id) {
        return sales.findById(id).map(SaleDto::from)
                .orElseThrow(() -> new NotFoundException("Sale not found"));
    }

    /**
     * Create a sale atomically: validates salable stock for every line, deducts
     * from batches in FEFO order (earliest expiry first, with NULL expiry last),
     * and writes the sale + line items in a single transaction. Any failure
     * rolls back the entire operation.
     */
    @Transactional
    public SaleDto create(CreateSaleRequest req, UUID cashierId) {
        User cashier = users.findById(cashierId)
                .orElseThrow(() -> new NotFoundException("Cashier not found"));

        StoreSettings storeSettings = settings.findById(1)
                .orElseThrow(() -> new IllegalStateException("Store settings missing"));
        BigDecimal taxRate = storeSettings.getTaxRate();

        Sale sale = new Sale();
        sale.setReference(generateReference());
        sale.setDate(Instant.now());
        sale.setCashier(cashier);
        sale.setCashierName(cashier.getName());
        sale.setPaymentMethod(req.paymentMethod());
        sale.setStatus(SaleStatus.COMPLETED);

        BigDecimal subtotal = BigDecimal.ZERO;

        for (CreateSaleRequest.Line line : req.items()) {
            Product product = products.findById(line.productId())
                    .orElseThrow(() -> new NotFoundException("Product not found: " + line.productId()));

            if (!product.isActive()) {
                throw new ConflictException("Product is inactive: " + product.getName());
            }
            if (product.getStock() < line.quantity()) {
                throw new ConflictException(
                        "Insufficient stock for " + product.getName()
                                + " (have " + product.getStock() + ", need " + line.quantity() + ")");
            }

            // Deduct from batches FEFO (throws ConflictException if insufficient).
            productService.deductStockFefo(product.getId(), line.quantity());

            SaleItem item = new SaleItem();
            item.setProduct(product);
            item.setProductName(product.getName());
            item.setQuantity(line.quantity());
            item.setUnitPrice(product.getPrice());
            BigDecimal lineTotal = product.getPrice()
                    .multiply(BigDecimal.valueOf(line.quantity()))
                    .setScale(2, RoundingMode.HALF_UP);
            item.setSubtotal(lineTotal);
            sale.addItem(item);

            subtotal = subtotal.add(lineTotal);
        }

        BigDecimal tax = subtotal.multiply(taxRate).setScale(2, RoundingMode.HALF_UP);
        BigDecimal total = subtotal.add(tax);

        sale.setSubtotal(subtotal);
        sale.setTax(tax);
        sale.setTotal(total);

        Sale saved = sales.save(sale);
        notifications.publishInventoryChanged();
        return SaleDto.from(saved);
    }

    /**
     * Admins can refund any sale; cashiers can only refund their own. Ownership
     * is checked server-side even though the UI filters by cashier, so a
     * hand-crafted request can't refund someone else's transaction.
     *
     * The optional {@code reason} is persisted on the sale and included in the
     * admin notification so managers can see why something was reversed.
     */
    @Transactional
    public SaleDto refund(UUID id, UUID requesterId, boolean isAdmin, String reason) {
        Sale sale = sales.findById(id)
                .orElseThrow(() -> new NotFoundException("Sale not found"));
        if (!isAdmin && !sale.getCashier().getId().equals(requesterId)) {
            throw new AccessDeniedException("Cannot refund another cashier's sale");
        }
        if (sale.getStatus() == SaleStatus.REFUNDED) {
            throw new ConflictException("Sale already refunded");
        }
        sale.setStatus(SaleStatus.REFUNDED);
        String trimmed = reason == null ? null : reason.trim();
        sale.setRefundReason(trimmed == null || trimmed.isEmpty() ? null : trimmed);

        // Replenish inventory by creating a "refund" batch for each line item.
        // We don't track which original batch the units came from (sale_items
        // are product-granular), so the refund becomes a fresh batch without
        // expiry — the admin can write it off if appropriate.
        for (SaleItem item : sale.getItems()) {
            ProductBatch refundBatch = new ProductBatch();
            refundBatch.setProduct(item.getProduct());
            refundBatch.setQuantityReceived(item.getQuantity());
            refundBatch.setQuantityRemaining(item.getQuantity());
            refundBatch.setNote("Refund from sale " + sale.getReference());
            batches.save(refundBatch);
        }

        User requester = users.findById(requesterId).orElse(null);
        publishRefundNotification(sale, requester);
        notifications.publishInventoryChanged();
        return SaleDto.from(sale);
    }

    private void publishRefundNotification(Sale sale, User requester) {
        String requesterName = requester != null ? requester.getName() : "Someone";
        String originalCashier = sale.getCashierName();
        boolean selfRefund = requester != null && requester.getId().equals(sale.getCashier().getId());

        String subject = selfRefund
                ? String.format(Locale.ROOT, "%s refunded their sale %s", requesterName, sale.getReference())
                : String.format(Locale.ROOT, "%s refunded %s's sale %s",
                        requesterName, originalCashier, sale.getReference());
        String reason = sale.getRefundReason();
        String body = reason == null
                ? String.format(Locale.ROOT, "%s (%s)", subject, sale.getTotal().toPlainString())
                : String.format(Locale.ROOT, "%s (%s) — %s", subject, sale.getTotal().toPlainString(), reason);

        Map<String, Object> data = new HashMap<>();
        data.put("saleId", sale.getId());
        data.put("reference", sale.getReference());
        data.put("cashierId", sale.getCashier().getId());
        data.put("cashierName", originalCashier);
        data.put("refundedBy", requesterName);
        data.put("total", sale.getTotal());
        data.put("itemCount", sale.getItems().size());
        if (reason != null) data.put("reason", reason);

        notifications.publishToAdmins(NotificationEvent.of(
                "sale.refunded",
                "Sale refunded",
                body,
                data,
                "/admin/sales"
        ));
    }

    private String generateReference() {
        String datePart = LocalDate.now(ZoneOffset.UTC).toString().replace("-", "");
        int random = ThreadLocalRandom.current().nextInt(10_000, 99_999);
        return String.format(Locale.ROOT, "S-%s-%d", datePart, random);
    }
}
