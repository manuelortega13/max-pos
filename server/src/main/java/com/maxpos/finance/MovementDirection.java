package com.maxpos.finance;

/**
 * IN = money into the account, OUT = money out. Amounts are always
 * positive; sign is carried by the direction so SUM(amount * sign)
 * gives the balance.
 */
public enum MovementDirection {
    IN,
    OUT
}
