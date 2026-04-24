package com.maxpos.sale;

/**
 * How a discount's {@code value} should be interpreted.
 *
 * <ul>
 *   <li>{@link #PERCENT} — {@code value} is a percentage 0-100. The resulting
 *       amount-off is {@code base × value / 100}.</li>
 *   <li>{@link #FIXED} — {@code value} is a money amount, clamped to
 *       {@code base} so we never flip the total negative.</li>
 * </ul>
 */
public enum DiscountType {
    PERCENT,
    FIXED
}
