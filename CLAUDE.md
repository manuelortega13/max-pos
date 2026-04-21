# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

MaxPOS is a Point of Sale system with two user-facing workspaces:
an **admin** console (manage the whole store) and a **cashier** register (ring up sales).
The repo is a **monorepo** with the Angular 21 frontend at the root and the Spring Boot
backend in `server/`. The Angular app is currently still driven by seeded in-memory data
(`core/services/` + `core/mock-data/`); wiring it to the `server/` API is not yet done.

## Commands — frontend (repo root)

- `npm start` / `ng serve` — dev server at `http://localhost:4200/`
- `npm run build` / `ng build` — production build to `dist/`
- `npm run watch` — dev build in watch mode
- `npm test` / `ng test` — run unit tests (Vitest)
- Single test file: `ng test --include src/app/app.spec.ts`

No lint script is configured. No e2e framework is installed.

## Architecture

Angular **21.1** + Angular Material **21.2** with a feature-based layout:

```
src/app/
  app.ts | app.config.ts | app.routes.ts   ← root bootstrap + routing
  core/
    models/          ← domain types (Product, Category, Sale, User, CartLine, StoreSettings)
    mock-data/       ← seed data constants consumed by services
    services/        ← signal-based state (ProductService, CartService, SaleService, ...)
  layouts/
    admin-layout/    ← mat-sidenav shell for /admin/*
    cashier-layout/  ← mat-toolbar shell for /cashier/*
  features/
    home/            ← role-picker landing page
    admin/{dashboard,products,categories,inventory,sales,users,reports,settings}/
    cashier/{pos,transactions}/
  shared/
    pipes/           ← MoneyPipe (formats using SettingsService currency)
```

Key conventions used consistently across the codebase — follow these when adding code:

- **Zoneless, standalone, OnPush.** The app runs with `provideZonelessChangeDetection()` (see `app.config.ts`). Every component uses `standalone: true` (implicit in Angular 21) and `changeDetection: ChangeDetectionStrategy.OnPush`. Adding a component without OnPush breaks the pattern.
- **Signals everywhere.** All service state is held in `signal()` and exposed via `.asReadonly()`; derived values use `computed()`. No `BehaviorSubject`s, no `Store`. Components subscribe by calling the signal as a function in the template.
- **`inject()` over constructor DI.** Every service/component uses `inject(SomeService)` at field initialization.
- **New control flow only.** Use `@if`, `@for` (with `track`), `@empty`, `@switch`. No `*ngIf` / `*ngFor`.
- **Lazy-loaded routes.** All feature routes use `loadComponent: () => import(...).then(m => m.Foo)` in `app.routes.ts`. Layouts are themselves lazy-loaded; feature routes are their children.
- **Material-first UI.** Reusable UI comes from `@angular/material`: tables (`mat-table`), forms (`mat-form-field` + `mat-input`/`mat-select`), dialogs (`mat-dialog`), chips, buttons, icons, sidenav, toolbar. Tailwind is kept in the project for tiny utility layers (e.g. `w-full`) and anything Material doesn't cover — default to Material components first.
- **Money/formatting.** Format monetary values with the `money` pipe (`src/app/shared/pipes/currency-symbol.pipe.ts`) so the currency symbol stays in sync with `SettingsService`. Don't hardcode `$`.

### Theming

- Material M3 theme comes from the prebuilt `@angular/material/prebuilt-themes/azure-blue.css` (configured in `angular.json`). It exposes `--mat-sys-*` tokens (e.g. `var(--mat-sys-primary)`, `var(--mat-sys-surface)`) — component SCSS uses these rather than literal colors so the theme can be swapped.
- Tailwind v4 is available globally via `src/styles.css` (`@import 'tailwindcss'`). There is no `tailwind.config.js` — v4 uses CSS-based configuration.
- Component styles are written in `.scss` using BEM-ish nesting. The Sass compiler is installed; the global entry stays plain CSS.
- Roboto and Material Symbols Outlined are loaded via Google Fonts from `src/index.html`.

### Data flow

Services in `core/services/` own all state. Components inject them and read signals. No HTTP, no persistence — services are initialized from `core/mock-data/*.mock.ts`. When introducing a real backend, replace the mock arrays with HTTP calls (or resource APIs) inside these services; components should not need to change.

`CartService` is the one service with a mutation API (`add`, `setQuantity`, `increment`, `decrement`, `clear`) — it's how the POS screen builds up a sale. It also exposes `subtotal`, `tax`, and `total` as computed signals that read `SettingsService.settings().taxRate`.

### Routing map

- `/` — role picker (home page)
- `/admin` → `admin-layout` with children: `dashboard`, `products`, `categories`, `inventory`, `sales`, `users`, `reports`, `settings`
- `/cashier` → `cashier-layout` with children: `pos`, `transactions`
- `**` → redirect to `/`

## TypeScript strictness

`tsconfig.json` enables `strict`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, and `strictTemplates`. Template errors fail the build. Component selectors use the `app-` prefix.

## Formatting

Prettier config lives in `package.json`: `printWidth: 100`, `singleQuote: true`, HTML uses the `angular` parser. There's no Prettier CLI script — rely on editor integration or `npx prettier`.

## Git conventions

- **Do not add a `Co-Authored-By: Claude …` trailer to commit messages.** Commits should be authored solely by the human contributor.

## Testing notes

Tests use **Vitest** (not Karma/Jasmine) via `@angular/build:unit-test`. Globals come from `vitest/globals` (see `tsconfig.spec.json`). When testing components that depend on routing, provide routes with `provideRouter([])` — the default `App` test does this.

## Server (`server/`)

Spring Boot 4.0 / Java 21 / PostgreSQL / Flyway / Spring Security with JWT.
See `server/README.md` for full setup & endpoint reference. Quick points:

- **Commands from `server/`:** `./gradlew bootRun` (dev), `./gradlew build` (compile+test+jar), `./gradlew assemble` (no tests).
- **Config by env vars:** `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `JWT_SECRET`. Defaults in `application.yml` are local-dev only — do not ship them.
- **Schema is owned by Flyway** (`src/main/resources/db/migration/V*.sql`). `spring.jpa.hibernate.ddl-auto=validate` deliberately blocks Hibernate from mutating it. New changes → new `V{n}__description.sql`, never edit applied migrations.
- **Layering:** Controller → Service → Repository. Controllers accept/return DTO records only; entities never cross the service boundary.
- **Transactions:** services are annotated `@Transactional(readOnly = true)` at the class level; mutating methods flip to `@Transactional` (write). `SaleService.create` is the canonical example — atomic stock deduction + sale + line items.
- **Auth:** stateless JWT. `JwtAuthenticationFilter` parses `Authorization: Bearer …` and populates `SecurityContext`. Admin-only endpoints use `@PreAuthorize("hasRole('ADMIN')")`.
- **Error envelope:** every thrown `NotFoundException` / `ConflictException` / validation / auth error is rendered as a uniform `ApiError` JSON via `GlobalExceptionHandler`.
- **API base path:** all endpoints live under `/api/*`. CORS is pre-configured for `http://localhost:4200` (configurable via `maxpos.cors.allowed-origins`).
- **Default seed admin:** `admin@maxpos.com` / `admin123` (from `V2__seed_data.sql`). Change in production.

