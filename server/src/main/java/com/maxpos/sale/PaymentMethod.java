package com.maxpos.sale;

public enum PaymentMethod {
    CASH,
    CARD,
    TRANSFER,
    /** Charge-on-account — the sale is paid later by a Creditor. */
    CREDIT
}
