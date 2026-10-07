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
