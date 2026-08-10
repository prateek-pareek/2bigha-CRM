# `@mathionix/ui`

Shared design-system primitives + product kit used by the suite portal (and extractable into other 2Bigha apps).

## Layers

| Import | Contents |
|--------|----------|
| `@mathionix/ui` | Primitives (Button, Dialog, …) + kit |
| `@mathionix/ui/kit` | Product kit: EmptyState, KitButton, StatusBadge, Breadcrumb, KpiCard, PageHeader, Field*, SectionCard, ChartPanel, EventCalendar, RecordCard, surfaces, `CRM_*` tokens |
| `@mathionix/ui/utils` | `cn()` |

## Usage

```tsx
import { Button, Dialog, EmptyState, KitButton, cn } from "@mathionix/ui"
import { CRM_PANEL, CrmEmptyState } from "@mathionix/ui/kit"
```

CRM portal keeps aliases (`CrmEmptyState`, `@/lib/crm/ui`) as thin re-exports.

The host app must provide Tailwind theme CSS variables (`--primary`, `--card-bg`, `--crm-shadow-card`, …).

## In this monorepo

- Source: `packages/ui/src/`
- Portal shims: `portal/src/common/components/ui/` (primitives), `portals/crm/components/ui/` (kit aliases)
- Next.js: `transpilePackages: ["@mathionix/ui"]`
