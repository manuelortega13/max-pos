package com.maxpos.creditor;

/**
 * When a creditor is expected to settle their outstanding balance.
 *
 *   FIFTEENTH  — on the 15th of each month
 *   MONTH_END  — on the last day of each month
 *
 * Kept as an enum (not a free-form string) so the report side can
 * group/sort by term and the UI can render a friendly label.
 */
public enum PaymentTerm {
    FIFTEENTH,
    MONTH_END
}
