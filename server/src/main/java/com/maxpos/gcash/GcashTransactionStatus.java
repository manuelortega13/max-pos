package com.maxpos.gcash;

/**
 * Workflow state of a GCash transaction.
 *
 *   PENDING   — cash is at the till, but the GCash side hasn't
 *               been completed yet. Only cash-in lands here on
 *               create; the admin flips it to COMPLETED after
 *               sending the GCash from their phone.
 *   COMPLETED — done. Cash-out always lands here on create (the
 *               cashier verifies the inbound GCash before handing
 *               cash, so it's finalized at the till).
 *
 * The transition is one-way: PENDING → COMPLETED. If a mistake is
 * made after completion, void the row and re-record.
 */
public enum GcashTransactionStatus {
    PENDING,
    COMPLETED
}
