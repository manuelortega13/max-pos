package com.maxpos.platform;

/** Lifecycle state of a store. SUSPENDED blocks its users from logging in
 *  and cuts off their existing sessions. */
public enum StoreStatus {
    ACTIVE,
    SUSPENDED
}
