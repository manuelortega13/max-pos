package com.maxpos.sale;

import com.maxpos.common.ConflictException;
import com.maxpos.common.NotFoundException;
import com.maxpos.product.Product;
import com.maxpos.product.ProductRepository;
import com.maxpos.sale.dto.CreateSaleRequest;
import com.maxpos.sale.dto.SaleDto;
import com.maxpos.settings.StoreSettings;
import com.maxpos.settings.StoreSettingsRepository;
import com.maxpos.user.User;
import com.maxpos.user.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

@Service
@Transactional(readOnly = true)
public class SaleService {

    private final SaleRepository sales;
    private final ProductRepository products;
    private final UserRepository users;
    private final StoreSettingsRepository settings;

    public SaleService(SaleRepository sales,
                       ProductRepository products,
                       UserRepository users,
                       StoreSettingsRepository settings) {
        this.sales = sales;
        this.products = products;
        this.users = users;
        this.settings = settings;
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
     * Create a sale atomically: validates stock for every line, deducts stock,
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

            product.setStock(product.getStock() - line.quantity());

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

        return SaleDto.from(sales.save(sale));
    }

    @Transactional
    public SaleDto refund(UUID id) {
        Sale sale = sales.findById(id)
                .orElseThrow(() -> new NotFoundException("Sale not found"));
        if (sale.getStatus() == SaleStatus.REFUNDED) {
            throw new ConflictException("Sale already refunded");
        }
        sale.setStatus(SaleStatus.REFUNDED);
        for (SaleItem item : sale.getItems()) {
            Product p = item.getProduct();
            p.setStock(p.getStock() + item.getQuantity());
        }
        return SaleDto.from(sale);
    }

    private String generateReference() {
        String datePart = LocalDate.now(ZoneOffset.UTC).toString().replace("-", "");
        int random = ThreadLocalRandom.current().nextInt(10_000, 99_999);
        return String.format(Locale.ROOT, "S-%s-%d", datePart, random);
    }
}
