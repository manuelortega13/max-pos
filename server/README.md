# MaxPOS Server

Spring Boot 4.0 / Java 21 / PostgreSQL / Flyway / Spring Security (JWT) backend for MaxPOS.

## Prerequisites

- **Java 21** (`java -version` should report 21.x)
- **PostgreSQL 13+** running locally (or reachable via `DB_URL`)
- Gradle wrapper is bundled — no separate Gradle install needed

## One-time setup

### 1. Create the database

Create a database and role manually in your PostgreSQL instance, for example:

```sql
CREATE ROLE maxpos WITH LOGIN PASSWORD 'change-me';
CREATE DATABASE maxpos OWNER maxpos;
GRANT ALL PRIVILEGES ON DATABASE maxpos TO maxpos;
```

### 2. Configure the app

Connection info is read from environment variables (with fallback defaults in
`src/main/resources/application.yml`). The easiest path is to export them in
your shell:

```bash
export DB_URL='jdbc:postgresql://localhost:5432/maxpos'
export DB_USERNAME='maxpos'
export DB_PASSWORD='change-me'
# Generate with: openssl rand -base64 48
export JWT_SECRET='<at least 32 random bytes, base64 is fine>'
```

Alternatively, create `src/main/resources/application-local.yml` (gitignored) and
run with `--spring.profiles.active=local`.

### 3. Run migrations + start the server

```bash
./gradlew bootRun
```

Flyway will run migrations `V1__initial_schema.sql` and `V2__seed_data.sql`
automatically on first startup. After that the seed admin is:

```
email:    admin@maxpos.com
password: admin123        ← change immediately in production
```

Health check: `GET http://localhost:8080/actuator/health` (if actuator is added)
or `POST /api/auth/login` to verify end-to-end.

## Common commands

- `./gradlew bootRun` — start dev server
- `./gradlew build` — compile + test + produce bootable jar
- `./gradlew assemble` — compile + package without running tests
- `./gradlew test` — unit + integration tests (requires a reachable DB)
- `./gradlew clean` — wipe `build/`

## Architecture

Feature-sliced packages under `com.maxpos.*`:

```
com.maxpos/
  MaxposServerApplication      ← @SpringBootApplication
  config/                      ← SecurityConfig, MaxPosProperties
  security/                    ← JwtService, JwtAuthenticationFilter, AppUserDetails(Service)
  common/                      ← ApiError, GlobalExceptionHandler, Not/Conflict exceptions
  auth/                        ← /api/auth — login, /me
  user/                        ← /api/users — admin only
  category/                    ← /api/categories
  product/                     ← /api/products (barcode lookup, admin-only writes)
  sale/                        ← /api/sales — @Transactional create, refund, cashier "mine"
  settings/                    ← /api/settings — singleton store config
```

### Conventions followed across the codebase

- **Controller → Service → Repository**, no direct JPA from controllers.
- **Services annotated `@Transactional(readOnly = true)` at the class level**;
  mutating methods flip to `@Transactional` (write). `SaleService.create()`
  is the canonical example — all stock adjustments and the sale write happen
  in one transaction so partial failures can't corrupt inventory.
- **DTOs are Java `record`s**, separate from JPA entities. Entities never
  leave the service layer; controllers accept and return DTOs.
- **Input validation with `jakarta.validation`**. A single
  `GlobalExceptionHandler` maps validation / auth / not-found / conflict
  errors to a uniform `ApiError` envelope.
- **Method-level security** via `@PreAuthorize("hasRole('ADMIN')")` for
  admin-only operations (everything except browsing products/categories,
  creating a sale, and reading own transactions).
- **Schema owned by Flyway.** `spring.jpa.hibernate.ddl-auto=validate`
  ensures Hibernate never mutates the schema — migrations do.

## Auth flow

1. Client `POST /api/auth/login` with `{email, password}`.
2. Server returns `{token, user}`. Token is a JWT signed with `JWT_SECRET`,
   subject = user id, with `role` claim.
3. Client sends `Authorization: Bearer <token>` on subsequent requests.
4. `JwtAuthenticationFilter` parses and sets `SecurityContext` per request;
   stateless (no session).
5. Default token lifetime: 8 hours (`maxpos.jwt.ttl-minutes: 480`).

## REST surface

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | public | returns `{token, user}` |
| GET | `/api/auth/me` | any authed | current principal |
| GET | `/api/products` | any authed | `?categoryId=`, `?activeOnly=true` |
| GET | `/api/products/{id}` | any authed | |
| GET | `/api/products/barcode/{barcode}` | any authed | scanner lookup |
| POST/PUT/DELETE | `/api/products` | ADMIN | |
| GET | `/api/categories` | any authed | |
| POST/PUT/DELETE | `/api/categories` | ADMIN | |
| GET | `/api/users` | ADMIN | whole endpoint admin-only |
| POST/PUT/DELETE | `/api/users` | ADMIN | |
| GET | `/api/sales` | ADMIN | every transaction |
| GET | `/api/sales/mine` | any authed | current cashier's sales |
| GET | `/api/sales/{id}` | any authed | |
| POST | `/api/sales` | any authed | creates sale transactionally (deducts stock) |
| POST | `/api/sales/{id}/refund` | ADMIN | reverses stock, flips status |
| GET | `/api/settings` | any authed | |
| PUT | `/api/settings` | ADMIN | |

## Extending

- **New feature module:** mirror `product/` — Entity + Repository + Service
  (`@Transactional(readOnly = true)`) + Controller + `dto/` record(s).
- **New migration:** add `V{n}__description.sql` under `src/main/resources/db/migration/`.
  Never edit applied migrations.
- **Admin seed data** lives in `V2__seed_data.sql`. For environment-specific
  seeds, prefer a separate profile and a Flyway placeholder rather than
  mutating the base migration.
