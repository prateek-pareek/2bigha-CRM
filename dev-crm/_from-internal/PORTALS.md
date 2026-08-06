# Portal-wise code layout

`src/` has four code roots:

| Root | Role |
|------|------|
| `app/` | Next.js routes (`app/<portal>/…`) |
| `portals/` | Product-owned code (CRM, HRMS, PM, …) |
| `common/` | **Reusable** UI/lib/hooks shared by multiple portals |
| `PORTALS.md` | This map |

Legacy imports (`@/components/crm/…`, `@/lib/suite/…`, `@/hooks/…`) resolve through `tsconfig.json` paths.

Prefer `@/portals/…` and `@/common/…` (or `@/components/common/…`) for new code.

## Portals

| Portal | Code | Routes |
|--------|------|--------|
| CRM | `src/portals/crm/{components,lib,hooks,stores}` — lib/components organized by module (`email/`, `records/`, …); no new flat `lib/*.ts` except chrome + shims | `src/app/crm/**` |
| HRMS | `src/portals/hrms/{components,lib,hooks}` (includes LMS); lib by module (`employees/`, `leaves/`, `lms/`, …) | `src/app/hrms/**` (LMS: `/hrms/lms`) |
| PM | `src/portals/pm/{components,lib,hooks,store}` — lib by module (`board/`, `issues/`, `wiki/`, `agent/`) | `src/app/pm/**` |
| Social | `src/portals/social/{components,lib,hooks}` — already module-foldered | `src/app/social/**` |
| Executive | `src/portals/executive/components` | `src/app/executive/**` |
| Client portal | `src/portals/client-portal/components` | `src/app/client-portals/**`, `src/app/portal/**` |
| Virtual office | `src/portals/virtual-office/components` | `src/app/virtual-office/**` |

## Common (shared)

See `src/common/README.md`. Highlights:

| Area | Path |
|------|------|
| Shell / chrome | `common/components/shell/` |
| UI kit | `@mathionix/ui` (`packages/ui`) — re-exported via `common/components/ui/` |
| Shared forms / charts | `common/components/forms/`, `…/charts/` |
| Auth / API / utils | `common/lib/` |
| Shared hooks | `common/hooks/` |

If two portals need the same widget, move it to `common/` — never import CRM from Social (etc.).

## Extracting a portal later

1. Copy `src/portals/<name>/` + `src/app/<name>/`
2. Copy or package `src/common/`
3. Point product `*_API_URL` at the dedicated API host
4. Drop unused `tsconfig` path aliases for other portals

## Rules

- New product code → `src/portals/<portal>/…`
- New shared/reusable code → `src/common/…`
- No cross-portal imports — `npm run check:boundaries`
- No new files at a portal `components/` root — use a module subfolder
- Do not recreate `src/components`, `src/lib`, or `src/hooks` folders

**AI / contributors:** see repo root [`AGENTS.md`](../../AGENTS.md) and [`.cursor/rules/`](../../.cursor/rules/) for the same rules enforced in Cursor.