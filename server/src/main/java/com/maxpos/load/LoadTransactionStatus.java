package com.maxpos.load;

/**
 * Workflow state of a load transaction. Mirrors the GCash cash-in
 * lifecycle:
 *
 *   PENDING   — cash collected at the till; admin still has to send
 *               the load from their phone.
 *   COMPLETED — admin has sent and confirmed. One-way transition.
 */
public enum LoadTransactionStatus {
    PENDING,
    COMPLETED
}
