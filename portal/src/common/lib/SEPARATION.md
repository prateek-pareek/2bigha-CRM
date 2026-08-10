# Common shared seams

Code every product portal may import lives under `src/common/` — not under `src/portals/<product>/`.

| Area | Path |
|------|------|
| Auth / roles / stored user | `common/lib/auth.ts` |
| Shared axios (master API) | `common/lib/api.ts` |
| API host config | `common/lib/api/config.ts` |
| Rich-text helpers | `common/lib/rich-text.ts` |
| Shell chrome | `common/components/shell/` |
| Rich text editor | `common/components/editors/RichTextEditor.tsx` |
| Shared forms / charts | `common/components/forms/`, `common/components/charts/` |
| UI kit / layout | `common/components/ui`, `common/components/layout` |
| Media / notifications / permissions | `common/lib/{media,notifications,permissions}` |
| Shared hooks | `common/hooks/` |

## Do

- Put new shared helpers under `src/common/`
- Import auth from `@/lib/suite/auth` or `@/common/lib/auth`
- Import shared API from `@/lib/suite/api` (not `@/lib/hrms/api`)
- Run `npm run check:boundaries` before merge

## Avoid

- Product portals importing each other
- Putting shared helpers under `src/portals/*/lib`

## See also

- `portal/src/common/README.md`
- `portal/src/PORTALS.md`
