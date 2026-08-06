# Common (shared across portals)

Reusable UI, hooks, and libs used by **more than one portal**.  
When you extract a portal, ship `common/` with it (or as a shared package) — do **not** copy portal-specific code into another portal.

**UI primitives** live in `@mathionix/ui` (`packages/ui`).  
`common/components/ui/` re-exports them so `@/components/ui/*` keeps working.

```
packages/ui/         # @mathionix/ui — Button, Dialog, Input, cn(), …
src/common/
  components/
    ui/              # thin re-exports → @mathionix/ui
    shell/           # AppShell, Sidebar, Providers, …
    editors/         # RichTextEditor
    forms/           # DateRangePicker, shared form controls
    charts/          # VennDiagram, shared chart widgets
    layout/          # module headers, layout chrome
    media/           # image upload fields
    notifications/   # notification list / inbox
    search/          # global search
    platform-tour/  # onboarding tours
  hooks/             # usePermissions, useNotifications, …
  lib/
    api/             # API host config, shared clients
    auth.ts          # suite auth helpers
    media/ permissions/ notifications/
    utils.ts         # cn(), shared helpers
```

## Do

- Put a component here only if **2+ portals** need it (or it is true platform chrome)
- Prefer `@mathionix/ui` for primitives; `@/components/ui/…` still works via re-exports
- Import other shared code via `@/components/common/…`, `@/common/…`, or legacy `@/components/suite/…` / `@/lib/suite/…`
- Keep portal branding out of common (no CRM-only buttons inside shared forms)

## Don’t

- Import `@/portals/crm|hrms|pm|social/…` from another portal — extract the shared bit into `common/` (or `@mathionix/ui`) instead
- Dump one-off portal screens into `common/` or `@mathionix/ui`

## Extracting a portal

1. Take `src/portals/<name>/` + `src/app/<name>/`
2. Depend on `@mathionix/ui` (and optionally ship remaining `src/common/`)
3. Point product API URLs from that portal’s `lib/config.ts`
