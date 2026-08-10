# CRM Nest ownership — module folders

| Module | Path |
|--------|------|
| Core (CRM CRUD / pipelines / search) | `core/` |
| Records (leads/contacts/orgs/deals/clients + schemas) | `records/` |
| Inbox | `inbox/` |
| Email / campaigns / postmaster | `email/` |
| Automation (workflows / playbooks) | `automation/` |
| Client portal | `portal/` |
| Proposals | `proposals/` |
| Integrations (WhatsApp / Teams) | `integrations/` |
| Admin (trash / fields / audit) | `admin/` |
| Platform opportunities | `opportunities/` |
| Service catalog / payment terms | `services/` |
| Calendar sync | `calendar/` |
| Sales strategies | `strategies/` |
| Website inbound | `website/` |
| PM progress bridge | `pm-bridge/` |
| AI | `ai/` |
| Shared utils / guards | `shared/` |
| Segments | `segments/` |
| Associations v2 | `associations/` |
| Custom objects | `custom-objects/` |
| Reporting | `reporting/` |
| CRM expenses / investment ROI | `expenses/` |
| CRM users / sales agent / DI | `crm-users/`, `sales-agent/`, `data-intelligence/` |
| Multi-platform migration / ETL | `migration/` |

Schemas live under `<module>/schemas/`. Root `schemas/` and `dto/` hold temporary re-export shims only — do not add new real files there.

## Do

- Add new CRM controllers/services/schemas/dtos under the matching module folder
- Keep CRM Mongo on `crmConnection`
- Keep `@Controller` HTTP paths unchanged when moving files

## Avoid

- New flat `src/crm/*.controller.ts` at the CRM root
- New real schemas/DTOs in root `schemas/` or `dto/` dumps

## Industry customization

Customize via custom fields, custom objects (`crm_object_types` / `crm_object_records`),
pipelines, and associations (`crm_associations`) — not per-vertical schema forks.

