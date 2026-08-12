# Backend common (shared across products)

Nest modules and libs used by **more than one product** (CRM / HRMS / PM / Social).  
When you extract a product API, ship `src/common/` with it (or as `@mathionix/api-common`).

```
api-hrms/src/
  common/
    auth/            # JWT, guards, roles, OAuth strategies
    users/           # platform user accounts
    notifications/   # push/in-app notifications
    mail/            # outbound email
    realtime/        # websockets / gateway
    redis/           # cache
    storage/         # media uploads (local server disk)
    search/          # cross-product search
    trash/           # soft-delete trash
    teams-bot/       # Teams integration helpers
    integrations/    # LLM / Anthropic / shared integrations
    audit/           # audit log interceptor
    types/           # shared TS types
    lib/
      mongo/         # connection labels, local URIs
      pagination/    # list pagination
      search/        # search-query utils
      crypto/        # shared crypto helpers
  crm/               # CRM product only
  hrms/              # HRMS product only
  pm/                # PM product only
  social/            # Social product only
  app.module.ts      # suite composer (wires products + common)
```

## Import style

Prefer relative paths into `common/` (Nest `tsc` emit-friendly):

```ts
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
```

Path aliases (IDE / new code): `@common/auth/...`, `@crm/...`, `@hrms/...`, `@pm/...`, `@social/...`  
(see `tsconfig.json` `paths` — use relatives in Nest sources until `tsconfig-paths` is wired in `main.ts` if you switch to aliases at runtime).

## Do

- Put Nest modules here only if **2+ products** need them
- Keep product business logic under `crm/`, `hrms/`, `pm/`, `social/`

## Don’t

- Import `crm` from `hrms` (or other product↔product) — extract shared bits into `common/`
- Put CRM controllers under `common/auth`

## Extracting a product API

1. Take `src/<product>/` + required `src/common/*` modules
2. Slim `app.module.ts` to that product + common
3. Point Mongo / env at the product database
