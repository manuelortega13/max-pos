package com.maxpos.sale;

import com.maxpos.businessday.BusinessDay;
import com.maxpos.businessday.BusinessDayRepository;
import com.maxpos.common.ConflictException;
import com.maxpos.creditor.Creditor;
import com.maxpos.creditor.CreditorRepository;
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
    private final BusinessDayRepository businessDays;
    private final CreditorRepository creditors;
    private final com.maxpos.finance.AccountMovementService accountMovements;

    public SaleService(SaleRepository sales,
                       ProductRepository products,
                       ProductBatchRepository batches,
                       ProductService productService,
                       UserRepository users,
                       StoreSettingsRepository settings,
                       NotificationPublisher notifications,
                       BusinessDayRepository businessDays,
                       CreditorRepository creditors,
                       com.maxpos.finance.AccountMovementService accountMovements) {
        this.sales = sales;
        this.products = products;
        this.batches = batches;
        this.productService = productService;
        this.users = users;
        this.settings = settings;
        this.notifications = notifications;
        this.businessDays = businessDays;
        this.creditors = creditors;
        this.accountMovements = accountMovements;
    }

    public List<SaleDto> list() {
        return sales.findAllByOrderByDateDesc().stream().map(SaleDto::from).toList();
    }

    /** Largest window the growth chart will aggregate, so a crafted
     *  {@code days} can't scan an unbounded history. */
    private static final int MAX_GROWTH_DAYS = 366;

    /**
     * Daily completed-sale revenue for the dashboard Sales Growth chart:
     * one zero-filled point per day across the last {@code days} (UTC), plus
     * the total of the immediately-preceding window of equal length for the
     * growth badge. Aggregated in the DB so the dashboard doesn't pull the
     * whole sales history to bucket client-side.
     */
    public com.maxpos.sale.dto.SalesGrowthDto growth(int days) {
        int n = Math.min(Math.max(days, 1), MAX_GROWTH_DAYS);
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        LocalDate windowStart = today.minusDays(n - 1L);
        LocalDate prevStart = today.minusDays(2L * n - 1);

        // Fetch both windows in one grouped query (prevStart .. today).
        Map<String, BigDecimal> byDay = new HashMap<>();
        for (Object[] r : sales.dailyCompletedRevenueSince(
                prevStart.atStartOfDay(ZoneOffset.UTC).toInstant())) {
            byDay.put((String) r[0], (BigDecimal) r[1]);
        }

        List<com.maxpos.sale.dto.SalesGrowthDto.DailyRevenue> points = new java.util.ArrayList<>(n);
        for (LocalDate d = windowStart; !d.isAfter(today); d = d.plusDays(1)) {
            points.add(new com.maxpos.sale.dto.SalesGrowthDto.DailyRevenue(
                    d.toString(), byDay.getOrDefault(d.toString(), BigDecimal.ZERO)));
        }

        BigDecimal previousTotal = BigDecimal.ZERO;
        for (LocalDate d = prevStart; d.isBefore(windowStart); d = d.plusDays(1)) {
            previousTotal = previousTotal.add(byDay.getOrDefault(d.toString(), BigDecimal.ZERO));
        }
        return new com.maxpos.sale.dto.SalesGrowthDto(points, previousTotal);
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
     *
     * @param offlineReplay  true when the request is a replay from the cashier's
     *   offline queue (X-Maxpos-Offline-Replay header). Replays bypass the
     *   open-day check so sales rung up while disconnected still land on sync.
     */
    @Transactional
    public SaleDto create(CreateSaleRequest req, UUID cashierId, boolean offlineReplay) {
        // Idempotent replay: if the caller supplied a clientRef (from the
        // offline queue) and a sale with that reference already exists,
        // return the existing record instead of creating a duplicate.
        if (req.clientRef() != null && !req.clientRef().isBlank()) {
            var existing = sales.findByReference(req.clientRef().trim());
            if (existing.isPresent()) {
                return SaleDto.from(existing.get());
            }
        }

        // Live sales require a currently-open business day. Offline replays
        // bypass this — they were authored while disconnected and we accept
        // them regardless, attaching to the current open day if one exists.
        BusinessDay openDay = businessDays.findFirstByClosedAtIsNull().orElse(null);
        if (!offlineReplay && openDay == null) {
            throw new ConflictException("No business day is open. An admin must open the day before sales can be rung up.");
        }

        User cashier = users.findById(cashierId)
                .orElseThrow(() -> new NotFoundException("Cashier not found"));

        StoreSettings storeSettings = settings.findById(1)
                .orElseThrow(() -> new IllegalStateException("Store settings missing"));
        BigDecimal taxRate = storeSettings.getTaxRate();
        boolean allowNegative = storeSettings.isAllowNegativeStock();

        String reference = (req.clientRef() != null && !req.clientRef().isBlank())
                ? req.clientRef().trim()
                : generateReference();

        // CREDIT sales must reference an active creditor; everything
        // else must NOT carry a creditorId. Surfacing as 400 here keeps
        // the DB-level check constraint from producing a 500.
        Creditor creditor = resolveCreditor(req);

        Sale sale = new Sale();
        sale.setReference(reference);
        sale.setDate(Instant.now());
        sale.setCashier(cashier);
        sale.setCashierName(cashier.getName());
        sale.setPaymentMethod(req.paymentMethod());
        sale.setStatus(SaleStatus.COMPLETED);
        sale.setBusinessDay(openDay);
        sale.setCreditor(creditor);

        BigDecimal subtotal = BigDecimal.ZERO;

        for (CreateSaleRequest.Line line : req.items()) {
            Product product = products.findById(line.productId())
                    .orElseThrow(() -> new NotFoundException("Product not found: " + line.productId()));

            if (!product.isActive()) {
                throw new ConflictException("Product is inactive: " + product.getName());
            }
            // When the store allows negative stock, cashiers may oversell past the
            // current batch total. deductStockFefo will drive the last touched
            // batch's quantity_remaining negative; the @Formula sum on Product.stock
            // reflects the oversell as a negative count.
            if (!allowNegative && product.getStock() < line.quantity()) {
                throw new ConflictException(
                        "Insufficient stock for " + product.getName()
                                + " (have " + product.getStock() + ", need " + line.quantity() + ")");
            }

            productService.deductStockFefo(product, line.quantity(), allowNegative);

            SaleItem item = new SaleItem();
            item.setProduct(product);
            item.setProductName(product.getName());
            item.setQuantity(line.quantity());
            item.setUnitPrice(product.getPrice());
            // Stamp the cost at sale time so future gross-profit reports
            // stay accurate when product.cost drifts.
            item.setUnitCost(product.getCost());
            BigDecimal lineGross = product.getPrice()
                    .multiply(BigDecimal.valueOf(line.quantity()))
                    .setScale(2, RoundingMode.HALF_UP);

            BigDecimal lineDiscountAmount = computeDiscount(lineGross, line.discount());
            BigDecimal lineNet = lineGross.subtract(lineDiscountAmount);
            item.setSubtotal(lineNet);
            if (line.discount() != null) {
                item.setDiscountType(line.discount().type());
                item.setDiscountValue(line.discount().value());
                item.setDiscountAmount(lineDiscountAmount);
            }
            sale.addItem(item);

            subtotal = subtotal.add(lineNet);
        }

        // Order-level discount, applied against the line-net subtotal.
        BigDecimal orderDiscountAmount = computeDiscount(subtotal, req.discount());
        if (req.discount() != null) {
            sale.setDiscountType(req.discount().type());
            sale.setDiscountValue(req.discount().value());
            sale.setDiscountAmount(orderDiscountAmount);
        }

        BigDecimal taxable = subtotal.subtract(orderDiscountAmount);
        BigDecimal tax = taxable.multiply(taxRate).setScale(2, RoundingMode.HALF_UP);
        BigDecimal total = taxable.add(tax);

        sale.setSubtotal(subtotal);
        sale.setTax(tax);
        sale.setTotal(total);

        Sale saved = sales.save(sale);
        // Finance ledger — write the IN movement for the appropriate
        // account (cash/card/transfer). CREDIT sales don't move
        // cash; the recorder no-ops for them and waits for the
        // matching creditor payment to land instead.
        accountMovements.recordForSale(saved);
        notifications.publishInventoryChanged();
        publishDiscountNotificationIfAny(saved, cashier);
        return SaleDto.from(saved);
    }

    /**
     * Enforce the "payment method ↔ creditorId" symmetry from the
     * V18 schema check. Throws a clean 400 / 409 instead of the bare
     * DataIntegrityViolation 500 a violated constraint would produce.
     */
    private Creditor resolveCreditor(CreateSaleRequest req) {
        boolean isCredit = req.paymentMethod() == PaymentMethod.CREDIT;
        UUID id = req.creditorId();
        if (isCredit && id == null) {
            throw new ConflictException("Credit sales require a creditor.");
        }
        if (!isCredit && id != null) {
            throw new ConflictException("Only credit sales can be linked to a creditor.");
        }
        if (id == null) return null;
        Creditor c = creditors.findById(id)
                .orElseThrow(() -> new NotFoundException("Creditor not found"));
        if (!c.isActive()) {
            throw new ConflictException("Creditor \"" + c.getFullName() + "\" is inactive.");
        }
        return c;
    }

    /**
     * Given a base amount and a (possibly null) discount input, return the
     * actual money off. Clamps to the base so a rogue FIXED value can't push
     * a row below zero. Returns ZERO when the discount is missing / invalid.
     */
    private BigDecimal computeDiscount(BigDecimal base, CreateSaleRequest.Discount d) {
        if (d == null || d.value() == null || d.value().signum() <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal amount = switch (d.type()) {
            case PERCENT -> base.multiply(d.value())
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            case FIXED -> d.value();
        };
        if (amount.compareTo(base) > 0) amount = base;
        return amount.setScale(2, RoundingMode.HALF_UP);
    }

    private void publishDiscountNotificationIfAny(Sale sale, User cashier) {
        BigDecimal orderOff = sale.getDiscountAmount() == null ? BigDecimal.ZERO : sale.getDiscountAmount();
        BigDecimal lineOff = sale.getItems().stream()
                .map(SaleItem::getDiscountAmount)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalOff = orderOff.add(lineOff);
        if (totalOff.signum() <= 0) return;

        // Build a short, factual body. We list up to the first two item names
        // that got a line discount so the admin can see what was marked down
        // at a glance without rendering the entire basket.
        java.util.List<String> discountedItemNames = sale.getItems().stream()
                .filter(i -> i.getDiscountAmount() != null && i.getDiscountAmount().signum() > 0)
                .map(SaleItem::getProductName)
                .limit(2)
                .toList();
        StringBuilder body = new StringBuilder()
                .append(cashier.getName())
                .append(" discounted ")
                .append(sale.getReference())
                .append(" by ")
                .append(totalOff.toPlainString());
        if (orderOff.signum() > 0) {
            body.append(" (order ").append(orderOff.toPlainString()).append(")");
        }
        if (!discountedItemNames.isEmpty()) {
            body.append(" on ").append(String.join(", ", discountedItemNames));
            long remaining = sale.getItems().stream()
                    .filter(i -> i.getDiscountAmount() != null && i.getDiscountAmount().signum() > 0)
                    .count() - discountedItemNames.size();
            if (remaining > 0) body.append(" and ").append(remaining).append(" more");
        }

        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("saleId", sale.getId());
        data.put("reference", sale.getReference());
        data.put("cashierId", cashier.getId());
        data.put("cashierName", cashier.getName());
        data.put("totalOff", totalOff);
        data.put("orderOff", orderOff);
        data.put("lineOff", lineOff);

        notifications.publishToAdmins(NotificationEvent.of(
                "sale.discounted",
                "Discount applied",
                body.toString(),
                data,
                "/admin/sales"
        ));
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
        // Finance ledger — write the offsetting OUT movement.
        accountMovements.recordForSaleRefund(sale);
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
