# PM Pipeline — Implementation Log & UI Testing Guide

**Date:** 2 September 2026  
**Reference docs:**
- `2bigha_API_Integration_Handbook_4.csv` — 2bigha GraphQL / API operations
- `2bigha_PM_Process_Flow_Document_1.md` — end-to-end Property Management flow

This document lists what was implemented in the CRM ↔ 2bigha PM integration today, and how to verify each piece in the UI (and optionally via API).

---

## Table of contents

1. [Architecture summary](#architecture-summary)
2. [What was done — backend](#what-was-done--backend)
3. [What was done — portal (UI)](#what-was-done--portal-ui)
4. [File index](#file-index)
5. [Prerequisites before testing](#prerequisites-before-testing)
6. [How to test in the UI](#how-to-test-in-the-ui)
7. [API smoke-test commands (optional)](#api-smoke-test-commands-optional)
8. [Known constraints & staging notes](#known-constraints--staging-notes)
9. [Process-flow coverage map](#process-flow-coverage-map)

---

## Architecture summary

PM cases are **not** created via the marketplace `createProperty` mutation. The correct path is:

```
Lead (with linked Client + twobighaUserId)
  → Collect PM subscription payment (optional if unbound credit exists)
  → Create PM property (createManagedPropertyByUser + tagSubscriptionToProperty)
  → Assign RM / Legal / Field (requires userPropertyId)
  → Legal verification → Field visit → Visit report review
```

All PM assignment, legal, visit, and report mutations on 2bigha require **`userPropertyId`**, not the marketplace property id.

---

## What was done — backend

### 1. PM property create (fixed path)

| Item | Detail |
|------|--------|
| **Service** | `api/src/crm/property-listings/twobigha-pm-create.service.ts` |
| **Handbook ops** | `createManagedPropertyByUser`, `tagSubscriptionToProperty` |
| **Routing** | Listings with `listingBucket=pm` call `syncPmToTwoBigha()` instead of marketplace `createProperty` |
| **Requirement** | Lead must have a linked client with `twobighaUserId` |

When create succeeds, the CRM listing stores `userPropertyId` so downstream PM APIs can run.

---

### 2. PM staff assignment

| Item | Detail |
|------|--------|
| **Service** | `api/src/crm/property-listings/twobigha-pm-assignment.service.ts` |
| **REST** | See [Assignment endpoints](#assignment-endpoints) |
| **Handbook ops** | RM / Legal / Field assign & reassign on managed properties |

---

### 3. PM workflow (legal, visits, reports) — **new**

| Item | Detail |
|------|--------|
| **Service** | `api/src/crm/property-listings/twobigha-pm-workflow.service.ts` |
| **DTOs** | `api/src/crm/property-listings/dto/pm-workflow.dto.ts` |
| **State merge util** | `api/src/crm/property-listings/pm-listing-workflow.util.ts` |

GraphQL mutations wired:

| CRM action | 2bigha GraphQL |
|------------|----------------|
| Start legal | `startLegalCheck` |
| Save checklist item | `saveLegalChecklistResponse` |
| Complete legal | `completeLegalCheck` |
| Schedule visit | `scheduleVisitDirectlyByRM` |
| Update visit status | `updateFieldVisitStatus` |
| Review report | `reviewVisitReport` / `reviewReportSections` / `rejectReportAndReschedule` |
| Assignment detail read | `getPropertyAssignmentDetails` |

Listing schema extended with: `legalVerification`, `fieldVisit`, `visitReport`, `pmWorkflowIds`, `areaValue`, `areaBigha`.

---

### 4. PM subscriptions & payments — **extended**

| Item | Detail |
|------|--------|
| **Service** | `api/src/crm/subscriptions/twobigha-subscriptions.service.ts` |
| **DTOs** | `api/src/crm/subscriptions/dto/pm-order.dto.ts` |

New / extended methods:

| Method | 2bigha GraphQL |
|--------|----------------|
| `getPMPlans()` | `getPMPlans` |
| `getPMPlanVariant()` | `getPMPlanVariant` |
| `createPmOrderForUser()` | `adminCreateSubscriptionOrder` (fallback: `createPMOrder`) |
| `verifyPmPaymentForUser()` | `adminVerifySubscriptionPayment` (fallback: `verifyPMPayment`) |
| `getLeadPmOverview()` | Combines unbound subs + managed property detail + CRM PM listings |
| `getUnboundSubscriptions()` | Existing |
| `getManagedPropertyDetail()` | Existing (restored after accidental overwrite) |

---

### 5. NestJS REST endpoints — **new / extended**

#### Assignment endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/crm/property-listings/pm/assignment-staff` | Staff picker pools (RM / Legal / Field) |
| `POST` | `/crm/property-listings/:id/pm/assign` | Assign staff |
| `POST` | `/crm/property-listings/:id/pm/unassign` | Unassign staff |

#### PM workflow endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/crm/property-listings/pm/lead-overview/:leadId` | Combined lead PM status |
| `POST` | `/crm/property-listings/:id/pm/legal/start` | Start legal verification |
| `PUT` | `/crm/property-listings/:id/pm/legal/checklist` | Update legal checklist |
| `POST` | `/crm/property-listings/:id/pm/legal/complete` | Complete legal |
| `POST` | `/crm/property-listings/:id/pm/visit/schedule` | Schedule field visit |
| `POST` | `/crm/property-listings/:id/pm/visit/status` | Set visit status (Pending / Complete / Cancel) |
| `POST` | `/crm/property-listings/:id/pm/visit/report/submit` | Submit visit report |
| `POST` | `/crm/property-listings/:id/pm/visit/report/review` | RM approve / reject report |

#### Subscription / payment endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/crm/subscriptions/pm-plans` | PM plan catalog |
| `GET` | `/crm/subscriptions/pm-plans/variant/:variantId` | Single variant detail |
| `GET` | `/crm/subscriptions/unbound/:leadId` | Unbound subscription credits |
| `GET` | `/crm/subscriptions/assignment/:userPropertyId` | Assignment details from 2bigha |
| `POST` | `/crm/subscriptions/pm-order` | Create Razorpay order for lead |
| `POST` | `/crm/subscriptions/pm-order/verify` | Verify Razorpay payment |
| `GET` | `/crm/subscriptions/managed-property/:propertyId` | Managed property detail |
| `GET` | `/crm/subscriptions/order-status/:orderId` | Order diagnostic |

---

### 6. Module wiring fixes

- `TwoBighaPmWorkflowService` registered once in `CRMModule` (exported for reuse).
- Removed duplicate provider from `PropertyListingsModule` to avoid NestJS DI conflicts.
- `PropertyListingsService` owns `getLeadPmOverview(leadId)` (avoids cross-module `PropertyListing` model injection in subscriptions controller).
- `VisitsModule` imported into `PropertyListingsModule` for visit report reads.
- API TypeScript check passes: `npx tsc --noEmit` in `api/`.

---

### 7. Cleanup

Removed temporary introspection scripts:

- `api/scripts/_debug-pm-types.js`
- `api/scripts/_debug-pm-missing.js`
- `api/scripts/_debug-pm-remaining.js`

---

## What was done — portal (UI)

### 1. PM workflow HTTP adapter — **rewired**

| File | Change |
|------|--------|
| `portal/src/portals/crm/lib/property-management/http-pm.ts` | Now calls Nest CRM API (`/crm/property-listings/:id/pm/...`) instead of `NEXT_PUBLIC_2BIGHA_LISTINGS_API_URL` |

Used by `pm-api.ts` for live mode: legal start/checklist/complete, visit status, report submit/review.

---

### 2. Assignment API — **already live**

| File | Role |
|------|------|
| `portal/src/portals/crm/lib/property-management/assignment-api.ts` | RM / Legal / Field assign & unassign via CRM API |
| `portal/src/portals/crm/lib/property-management/pm-api.ts` | Facade: mock for demo IDs, live for real listings |

---

### 3. Subscriptions backend client — **extended**

| File | New functions |
|------|---------------|
| `portal/src/portals/crm/lib/subscriptions/backend-api.ts` | `fetchPMPlans`, `fetchPMPlanVariant`, `fetchLeadPmOverview`, `createPmOrder`, `verifyPmPayment` |
| `portal/src/portals/crm/lib/subscriptions/types.ts` | `PMPlanCatalogItem`, `PMPlanVariant`, `RazorpayOrderPayload`, `LeadPmOverview`, etc. |

---

### 4. Lead PM panel — **enhanced**

| File | Change |
|------|--------|
| `portal/src/portals/crm/components/records/associations/LeadPmPanel.tsx` | Uses `fetchLeadPmOverview` for combined status; shows RM/Legal/Field, legal status, visits remaining |

---

### 5. Collect payment UI — **new**

| File | Change |
|------|--------|
| `portal/src/portals/crm/components/subscriptions/PmCollectPaymentSection.tsx` | Plan picker → create order → Razorpay checkout → verify payment |

Shown on the lead PM panel when **no unbound subscriptions** exist for the lead.

---

### 6. Existing UI components (unchanged behaviour, now backed by live APIs)

| Component | Path | Role |
|-----------|------|------|
| `AddPmPropertyModal` | `components/records/detail/AddPmPropertyModal.tsx` | Create PM property from lead |
| `PmWorkflowPanel` | `components/property-listings/PmWorkflowPanel.tsx` | Full RM → Legal → Field → Report pipeline |
| `PmPropertyForm` | `components/property-listings/PmPropertyForm.tsx` | PM property form fields |
| `PmAssigneeSelect` | `components/property-listings/PmAssigneeSelect.tsx` | Staff picker dropdown |
| `OrderDiagnosticTool` | `components/subscriptions/OrderDiagnosticTool.tsx` | Check Razorpay order status |

---

## File index

### Backend

```
api/src/crm/
├── property-listings/
│   ├── twobigha-pm-create.service.ts      # PM create on 2bigha
│   ├── twobigha-pm-assignment.service.ts  # RM / Legal / Field assign
│   ├── twobigha-pm-workflow.service.ts    # Legal / visit / report GraphQL
│   ├── pm-listing-workflow.util.ts        # Managed detail → CRM fields
│   ├── dto/pm-workflow.dto.ts
│   ├── dto/assign-pm-staff.dto.ts
│   ├── property-listings.service.ts       # Orchestrates all PM actions
│   ├── property-listings.controller.ts    # REST routes
│   └── schemas/property-listing.schema.ts # PM workflow fields
├── subscriptions/
│   ├── twobigha-subscriptions.service.ts  # Plans, orders, lead overview
│   ├── subscriptions.controller.ts
│   └── dto/pm-order.dto.ts
└── crm.module.ts                          # Shared PM workflow service export
```

### Portal

```
portal/src/portals/crm/
├── lib/
│   ├── property-management/
│   │   ├── pm-api.ts           # Mock/live facade
│   │   ├── http-pm.ts          # Workflow CRM API calls
│   │   └── assignment-api.ts   # Assignment CRM API calls
│   └── subscriptions/
│       ├── backend-api.ts
│       └── types.ts
└── components/
    ├── records/associations/LeadPmPanel.tsx
    ├── records/detail/AddPmPropertyModal.tsx
    ├── property-listings/PmWorkflowPanel.tsx
    └── subscriptions/PmCollectPaymentSection.tsx
```

---

## Prerequisites before testing

### Environment

1. **API** running (`api/` — typically port 3000 or your configured port).
2. **Portal** running (`portal/` — typically port 3001 or Next.js default).
3. **2bigha GraphQL credentials** configured in API env (not mock mode):
   - If `TWOBIGHA_USE_MOCK=true`, PM plans/orders return mock data; assignment to real 2bigha staff will not work as on staging.

### Data setup

1. **Lead** with a **linked Client**.
2. Client must have **`twobighaUserId`** populated (synced 2bigha user).
3. CRM user logged in with permissions:
   - `property_listings:read`, `property_listings:write`
   - `leads:read`, `leads:write`

### Staging roster note

On staging, only certain 2bigha admin accounts are valid for RM assignment. **Arjun Mehta** is known to work; **System Admin** assignment fails. Use the staff picker — do not hard-code invalid IDs.

---

## How to test in the UI

Follow this order to exercise the full process flow. Each subsection maps to a screen in the CRM portal.

---

### Test 1 — Lead PM overview & combined status

**Where:** **Lead detail page** (`/crm/leads/{leadId}`) → right sidebar → **Associations** → **Property Management** panel  
**Component:** `LeadPmPanel`

> Open a lead from the board first (`/crm/leads` → click a lead card). The PM panel is **not** on the kanban list view.

**Steps:**

1. Open a lead that has a linked client with `twobighaUserId`.
2. Scroll to the **Property Management** / **Subscription** section.
3. Confirm the panel loads without errors (no infinite spinner).

**Expected:**

- **Subscription** block lists unbound credits (if any) with plan name, price, visits, purchase date.
- **Combined status banner** at top (e.g. subscription + assignment + legal status joined).
- **PM properties** list shows title, stage badge, RM/Legal/Field names when available.
- Each property links to `/crm/property-listings/{id}`.

**If no unbound subscription:** the **Collect PM subscription payment** block appears (see Test 2).

---

### Test 2 — Collect PM subscription payment

**Where:** Same lead panel, inside Subscription section  
**Component:** `PmCollectPaymentSection`

**Steps:**

1. Use a lead with **no** unbound subscription credit.
2. Select a **Plan** and **Variant** from the dropdowns.
3. Click **Pay with Razorpay**.
4. Complete payment in the Razorpay modal (test mode keys if configured).
5. Wait for success toast: *"Payment verified — subscription credit available"*.

**Expected:**

- Plan list loads from `/crm/subscriptions/pm-plans`.
- After payment, panel refreshes and unbound subscription appears in Test 1.

**If Razorpay does not open:**

- Check browser console for script / key errors.
- Order may still be created — use **Order Diagnostic Tool** (subscriptions area) with the order id.

---

### Test 3 — Create PM property

**Where:** **Lead detail page** (`/crm/leads/{leadId}`) — **not** the Leads kanban/list page  
**Component:** `AddPmPropertyModal` + `PmPropertyForm`

> **Important:** The Leads board at `/crm/leads` (All Leads / Property Listing / Property Management tabs) does **not** show **Create PM**. You must open a specific lead first.

**How to get there from your screenshot:**

1. On `/crm/leads`, click a lead card (e.g. **Unlinked Lead**) to open its detail page.
2. URL becomes `/crm/leads/<id>`.

**Create PM — two entry points on the lead detail page:**

| Location | What to click |
|----------|----------------|
| **Top quick actions** (near Farm / Property / Meeting) | **`PM`** button — clipboard icon, tooltip *"Create a Property Management case for this lead"* |
| **Right sidebar → Associations → Property Management** | Green **`+ Create PM`** button (inside `LeadPmPanel`) |

Both open the same **Create PM property** modal.

**Steps:**

1. Open a lead detail page, then click **`PM`** (header) or **`+ Create PM`** (sidebar).
2. Fill required fields: PM plan, property type, title, location, area, etc.
3. Submit **Submit PM property**.

**Expected:**

- Success toast mentioning `userPropertyId` if 2bigha sync succeeded.
- New PM property appears in Lead PM panel.
- Opening the listing shows `listingBucket=pm` and a PM stage (e.g. *Property Submitted*).

**Failure cases to verify:**

- Lead without client / `twobighaUserId` → error explaining sync requirement.
- Sync failed → local save with error toast; assignment will fail until retried.

---

### Test 4 — Assign RM, Legal, and Field Agent

**Where:** Property listing detail → PM Workflow panel  
**Component:** `PmWorkflowPanel` + `PmAssigneeSelect`

**Steps:**

1. Open the PM property created in Test 3.
2. Wait for staff pools to load (RM / Legal / Field dropdowns).
3. **Assign RM:** pick **Arjun Mehta** (staging) → **Assign RM**.
4. **Assign Legal:** pick a legal manager → **Assign Legal**.
5. **Assign Field Agent:** pick a field agent → **Assign Field Agent**.

**Expected:**

- Toast confirms each assignment.
- Assignee names appear on the listing.
- Stage rail advances (e.g. toward *Assigned to Legal* / *Assigned to Field Agent*).
- Unassign buttons work per role.

**Verify in network tab:**

- `POST /crm/property-listings/{id}/pm/assign`
- Response includes `listing` + `twobigha.status: synced`

---

### Test 5 — Legal verification

**Where:** Same PM Workflow panel (visible when stage is *Assigned to Legal*)  
**Component:** `PmWorkflowPanel`

**Steps:**

1. Enter a **Summary note**.
2. Click **Start verification**.
3. Toggle checklist items; notes auto-save on change.
4. Click **Complete verification**.

**Expected:**

- Legal status moves: *Not started* → *In progress* → *Completed*.
- Stage updates on listing after each action.
- Network calls:
  - `POST .../pm/legal/start`
  - `PUT .../pm/legal/checklist`
  - `POST .../pm/legal/complete`

---

### Test 6 — Field visit lifecycle

**Where:** PM Workflow panel (stage *Assigned to Field Agent*)  
**Component:** `PmWorkflowPanel`

**Steps:**

1. Add **Visit notes** if needed.
2. Click **Pending**, **Complete**, or **Cancel** to set visit status.
3. When status is **Complete**, click **Submit visit report**.

**Expected:**

- Visit status label updates with scheduled time if present.
- After submit, stage moves to *Visit Report Pending*.
- Network calls:
  - `POST .../pm/visit/status`
  - `POST .../pm/visit/report/submit`

**Note:** Dedicated **Schedule visit** API exists (`POST .../pm/visit/schedule`) but the current workflow panel relies on field assignment + status updates. Scheduling can be tested via API (see below).

---

### Test 7 — RM report review (approve / reject)

**Where:** PM Workflow panel (stage *Visit Report Pending*)  
**Component:** `PmWorkflowPanel`

**Steps:**

1. Review report section checklist (if rendered).
2. **Approve:** click approve → confirm toast.
3. **Or reject:** enter rejection reason → reject.

**Expected:**

- Stage becomes *Visit Report Approved* or *Visit Report Rejected*.
- `POST .../pm/visit/report/review` with `decision: Approved | Rejected`.

---

### Test 8 — Lead panel reflects pipeline changes

**Where:** Return to lead detail  
**Component:** `LeadPmPanel`

**Steps:**

1. After Tests 4–7, go back to the lead.
2. Refresh or trigger panel refresh (e.g. re-open lead).

**Expected:**

- Combined status banner reflects latest 2bigha state.
- Property row shows updated stage and assignee names.
- Unbound subscription count decreases if credit was bound to property.

---

### Test 9 — Order diagnostic (support tool)

**Where:** Subscriptions / admin area with **Payment Diagnostic Tool**  
**Component:** `OrderDiagnosticTool`

**Steps:**

1. Paste a Razorpay order id from Test 2.
2. Click **Check Status**.

**Expected:**

- Order status badge (SUCCESS / PENDING / etc.).
- Property binding status if applicable.

---

### Test 10 — Mock vs live mode

**Mock mode** (demo listing ids `tp_listing_*`, `mock_*`, or `NEXT_PUBLIC_*` mock flag):

- Assignment/legal/visit actions use in-memory mock — no 2bigha calls.

**Live mode** (real MongoDB listing id from CRM create):

- All actions go through Nest API → 2bigha GraphQL.

**How to confirm live mode:** Network requests hit your CRM API base URL (`/crm/property-listings/...`), not `NEXT_PUBLIC_2BIGHA_LISTINGS_API_URL`.

---

## API smoke-test commands (optional)

Replace `{TOKEN}`, `{LEAD_ID}`, `{LISTING_ID}`, `{USER_PROPERTY_ID}` with real values.

### Lead PM overview

```http
GET /crm/property-listings/pm/lead-overview/{LEAD_ID}
Authorization: Bearer {TOKEN}
```

### PM plans

```http
GET /crm/subscriptions/pm-plans
Authorization: Bearer {TOKEN}
```

### Unbound subscriptions

```http
GET /crm/subscriptions/unbound/{LEAD_ID}
Authorization: Bearer {TOKEN}
```

### Create PM order

```http
POST /crm/subscriptions/pm-order
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "leadId": "{LEAD_ID}",
  "planId": 1,
  "planVariantId": 1,
  "billingCycle": "YEARLY"
}
```

### Assign RM

```http
POST /crm/property-listings/{LISTING_ID}/pm/assign
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "role": "manager",
  "source": "twobigha",
  "id": "{ADMIN_ID}",
  "name": "Arjun Mehta"
}
```

### Start legal

```http
POST /crm/property-listings/{LISTING_ID}/pm/legal/start
Authorization: Bearer {TOKEN}
Content-Type: application/json

{ "summary": "Starting title review" }
```

### Managed property detail

```http
GET /crm/subscriptions/managed-property/pm_{USER_PROPERTY_ID}
Authorization: Bearer {TOKEN}
```

---

## Known constraints & staging notes

| Topic | Detail |
|-------|--------|
| **userPropertyId required** | Assignment, legal, visits, and reports fail without a bound managed property id. |
| **PM create path** | Never uses marketplace `createProperty` for `listingBucket=pm`. |
| **List id formats** | `pm_{userPropertyId}` = bound managed case; `pm_prop_{propertyId}` = no subscription bind. |
| **Staging RM** | Use **Arjun Mehta** for RM assign; System Admin fails on staging. |
| **Razorpay** | Requires valid `keyId` from order response; mock mode skips real checkout. |
| **Visit schedule UI** | Backend route exists; workflow panel uses assign + status flow primarily. |
| **Permissions** | JWT + RBAC guards on all CRM routes listed above. |

---

## Process-flow coverage map

| Process-flow step | Backend | Portal UI | Status |
|-------------------|---------|-----------|--------|
| Lead 360 / PM context | `getLeadPmOverview` | `LeadPmPanel` | Done |
| Collect payment | `createPmOrderForUser`, `verifyPmPaymentForUser` | `PmCollectPaymentSection` | Done |
| Create PM property | `syncPmToTwoBigha` | `AddPmPropertyModal` | Done |
| Assign RM | `assignPmStaff` | `PmWorkflowPanel` | Done |
| Assign Legal | `assignPmStaff` | `PmWorkflowPanel` | Done |
| Assign Field Agent | `assignPmStaff` | `PmWorkflowPanel` | Done |
| Start / complete legal | `twobigha-pm-workflow.service` | `PmWorkflowPanel` | Done |
| Legal checklist | `saveLegalChecklistResponse` | `PmWorkflowPanel` | Done |
| Schedule field visit | `scheduleVisitDirectlyByRM` | API only (no dedicated UI button yet) | Partial |
| Field visit status | `updateFieldVisitStatus` | `PmWorkflowPanel` | Done |
| Submit visit report | Local state + 2bigha reads | `PmWorkflowPanel` | Done |
| RM report review | `reviewVisitReport` / related | `PmWorkflowPanel` | Done |
| Unbound subscriptions | `getUnboundSubscriptions` | `LeadPmPanel` | Done |
| PM plan catalog | `getPMPlans` | `PmCollectPaymentSection` | Done |
| Order diagnostic | `getPMOrderStatus` | `OrderDiagnosticTool` | Done |

---

## Quick checklist (copy for QA)

- [ ] Lead has client with `twobighaUserId`
- [ ] Lead PM panel loads combined overview
- [ ] Payment flow creates unbound credit (if needed)
- [ ] PM property create returns `userPropertyId`
- [ ] RM assign succeeds (Arjun Mehta on staging)
- [ ] Legal assign + start + checklist + complete
- [ ] Field assign + visit status Complete + submit report
- [ ] RM approves or rejects report
- [ ] Lead panel shows updated stage and assignees
- [ ] All network calls go to CRM API (not old third-party listings URL)

---

*Generated from implementation work on 2 Sep 2026. Update this file when new PM steps are added or UI gaps (e.g. visit schedule button) are closed.*
