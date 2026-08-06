# Workflow & follow-up scheduling (durable queue)

All automation timing is stored in **MongoDB**, not in server memory. Deploying or restarting the API does **not** reset schedules.

## Data model

Collection: `workflowdelayedjobs` (Mongoose `WorkflowDelayedJob`)

| Field | Purpose |
|-------|---------|
| `runAt` | **Absolute UTC** time when the worker should run this job |
| `status` | `pending` → `processing` → `done` / `failed` / `cancelled` |
| `stepsRemaining` | Serialized follow-up / workflow steps still to execute |
| `sequenceStartedAt` | When the follow-up sequence started (reply detection) |
| `cancelOnReply` | Stop remaining sends if the contact replies |
| `sendGuard` | Prevents duplicate email if restart happens mid-send |

Follow-up sequences from the lead/contact UI create rows with `runAt` computed once at schedule time (e.g. day 2 = now + 2 days) and saved to the database.

## Worker

- Cron: `WORKFLOW_CRON` (default every **60s**) runs `processDueDelayedJobs`
- Maintenance: `WORKFLOW_MAINTENANCE_CRON` (default every **10 minutes**) runs stale-job reclaim + missed alternate-send recovery in one tick
- Claims jobs: `status: pending` AND `runAt <= now`
- Skips work when the queue is empty (`exists` check before claiming)
- Coalesces overlapping triggers (cron + API) so only one batch runs at a time per API instance
- On/off: CRM Settings → **Run scheduled workflow steps** (default **on** when unset). Not controlled by env vars.

### Tuning (env)

| Variable | Default | Purpose |
|----------|---------|---------|
| `WORKFLOW_CRON` | `*/60 * * * * *` | How often due jobs are claimed |
| `WORKFLOW_MAINTENANCE_CRON` | `0 */10 * * * *` | Stale reclaim + alternate auto-recovery |
| `WORKFLOW_JOBS_PER_TICK` | `50` | Max jobs per cron tick (cap 200) |
| `WORKFLOW_STALE_PROCESSING_MINUTES` | `30` | Reset stuck `processing` rows |

## Deploy / crash recovery

On API startup:

1. Any job stuck in `processing` is reset to `pending` (same `runAt` — not recalculated)
2. Due jobs (`runAt <= now`) are processed immediately (catch-up)

Every 10 minutes (maintenance cron), jobs in `processing` longer than `WORKFLOW_STALE_PROCESSING_MINUTES` (default 30) are reset to `pending`. Failed follow-ups with permanent send errors are marked `autoRecoveryBlockedAt` so maintenance does not re-scan them every tick.

## Idempotency

If the server dies after sending an email but before marking the job `done`, `sendGuard` on the job row prevents sending the same template twice when the job is reclaimed.

## Operations

- Pause automation only via CRM Settings → Workflows (not env vars)
- Multiple API instances: each instance runs the cron; atomic claim reduces duplicates; `sendGuard` helps
