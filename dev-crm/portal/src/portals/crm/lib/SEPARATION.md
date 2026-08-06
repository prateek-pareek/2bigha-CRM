> Canonical home: `portal/src/portals/crm/` (see `src/PORTALS.md`).

# Separating CRM from the suite portal

## Module folders (extract by module)

CRM is organized so each domain can be moved independently.

**Rule:** Do not add new files at `portals/crm/lib/*.ts` except thin re-export shims, `index.ts`, and shared chrome (`api.ts`, `config.ts`, `chrome.ts`, `shell.ts`, `ui.ts`). Put new code under the matching module folder.

### Frontend `portal/src/portals/crm/lib/`

| Module | Path |
|--------|------|
| Shared chrome | `api.ts`, `config.ts`, `chrome.ts`, `ui.ts`, `shell.ts`, `index.ts` |
| Records | `records/` |
| Inbox | `inbox/` |
| Email / outreach | `email/` |
| Email intelligence / finder | `email-intelligence/` |
| Data intelligence | `data-intelligence/` |
| Sales AI | `sales/` |
| Automation | `automation/` |
| Segments | `segments/` |
| Search | `search/` |
| Platform opportunities | `platform/` |
| Proposals | `proposals/` |
| Shared utils | `shared/` |
| Hooks | `hooks/` |

Flat paths like `@/lib/crm/list-query` re-export from module folders (temporary shims). Prefer `@/lib/crm/<module>` or `@/portals/crm/lib/<module>/…` for new call sites.

### Frontend `portal/src/portals/crm/components/`

| Module | Path |
|--------|------|
| UI kit | `ui/` (shims → `@mathionix/ui/kit` for EmptyState, KitButton, tokens, …) |
| Records | `records/` |
| Inbox | `inbox/` |
| Email | `email/` |
| Automation | `automation/` |
| Segments / views | `segments/` |
| Platform | `platform/` |
| Proposals | `proposals/` |
| Reports | `reports/` |
| Sales | `sales/` |
| Shell | `shell/` |
| Calendar | `calendar/` |

### Backend `api-hrms/src/crm/`

| Module | Path |
|--------|------|
| Core | `core/` |
| Records | `records/` (+ record schemas) |
| Inbox | `inbox/` |
| Email | `email/` |
| Automation | `automation/` |
| Portal | `portal/` |
| Proposals | `proposals/` |
| Integrations | `integrations/` |
| Admin | `admin/` |
| Opportunities | `opportunities/` |
| Services | `services/` |
| Calendar | `calendar/` |
| Strategies | `strategies/` |
| Website inbound | `website/` |
| PM bridge | `pm-bridge/` |
| AI | `ai/` |
| Users / agents | `crm-users/`, `sales-agent/`, `data-intelligence/` |

Schemas and DTOs live under the owning module (`<module>/schemas/`, `<module>/dto/`), not a root dump folder.

## Do

- Put new CRM code in the matching module folder
- Import `CRM_API_URL` from `@/lib/crm/config`
- Prefer module barrels over deep legacy paths when adding call sites

## Avoid

- Cross-product imports (`@/lib/hrms`, `@/lib/pm`, …)
- New flat files at `lib/crm/*.ts` or `src/crm/*.controller.ts` (except shared chrome/config)
- Renaming HTTP `@Controller` paths or app routes during folder moves

## Extract steps (later)

1. Move one module folder (e.g. `inbox/`) into a CRM package
2. Replace suite shell only when the whole CRM app is extracted
3. Point `CRM_API_URL` at a dedicated CRM API host
