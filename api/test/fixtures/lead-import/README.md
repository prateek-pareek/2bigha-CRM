# Lead bulk-import fixtures

CSV files for manually testing **Leads → Import** (runbook test #30). Headers match the
portal's downloadable template, so every column auto-maps.

| File | Import from | Expected result |
|---|---|---|
| `leads-bulk-150.csv` | Leads (`/crm/leads`) → Import | **150 created, 0 failed**. Lead count +150. Open any row: Call Status = Not Called, Property Listing pipeline, first stage. |
| `leads-pm-blank-vertical-10.csv` | PM Leads (`/crm/pm/leads`) → Import | 10 created. Lead Vertical = Property Management. |
| `leads-freetext-mapping-14.csv` | Leads → Import | 14 created. Each lead's **Notes** says what its value should map to (e.g. `RNR` → Not Answered, `Seller` → OWNER). |
| `leads-one-bad-row-10.csv` | Leads → Import | 9 created, **1 failed** (row 5, Call Status "Maybe later") with a readable message. |

All phones are valid 10-digit numbers starting with 9, and all emails are `@example.com`,
both unique within and across files.

## Re-running

Import matches existing leads by email. To import again and get new leads, either choose
**Always create new** as the duplicate strategy, or generate a fresh set with a new tag:

```bash
node api/test/fixtures/lead-import/generate.js t2
```

## Cleanup

Every test lead has an email ending in `@example.com` and a note starting with
`Bulk import test`, `PM import test`, `Bad-row test` or `EXPECT:`. Search for these to find
and delete them afterwards.

## Duplicate-handling fixtures

Import each file **twice in a row** (same duplicate strategy) and compare. Delete or use a fresh
database between strategy runs — the first row of each group is created on the first pass.

### `leads-duplicates-12.csv` — Leads → Import (also try with an assignment option)

Rows 4, 5, 8, 12 repeat an earlier row of the **same file** (phone with different formatting,
email with different case, leading-0 phone, repeated email). Row 10 has no phone/email.

| Strategy | Expected on a clean DB |
|---|---|
| Skip duplicates | 7 created, 4 skipped ("Duplicate of an earlier row in this file"), 1 invalid/failed (row 10) |
| Merge | 7 created, 4 merged into the earlier row, row 10 invalid |
| Replace | 7 created, 4 replaced, row 10 invalid |
| Always create new | 11 created (duplicates kept), row 10 invalid |

Second pass on the same DB with *Skip*: 0 created, 11 skipped (every row now matches DB), row 10 invalid.
Use **Check duplicates & owners** on the preview step to see the same counts without saving.

### `clients-duplicates-8.csv` — Clients → Import

Row 4 repeats row 1's email, row 5 repeats row 2's phone (formatting differs), row 6 repeats
row 2's *additional* email. Row 8 has an unrecognised Role (imports as USER, counted in
"invalid role").

| Strategy | Expected on a clean DB |
|---|---|
| Skip | 5 created, 3 skipped |
| Merge | 5 created, 3 merged |
| Always create new | 8 created |
