package com.maxpos.subscription.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/** Store owner's plan choice. */
public record SubscribeRequest(@NotNull UUID planId) {}
