package com.maxpos.platform.plan;

import java.util.UUID;

/** Assign (or clear, when planId is null) a store's plan. */
public record AssignPlanRequest(UUID planId) {}
