# Email Tracking & Deliverability

## Email Tracking

The CRM automatically tracks:

- **Opens**: A 1x1 transparent pixel is embedded in sent emails. When the recipient opens the email, the pixel loads and records the open.
- **Clicks**: Links in the email body are wrapped with redirect URLs. When the recipient clicks a link, they're redirected through our server (which records the click) to the destination.

### API Endpoints

- `GET /api/crm/track/open/:token` — Public. Returns a 1x1 GIF and records an open. No auth required (called by email clients).
- `GET /api/crm/track/click/:token?u=<base64-url>` — Public. Records click and redirects to destination. No auth required.
- `GET /api/crm/track/entity/:entityId?module=contacts` — Authenticated. Returns tracking stats for a lead, contact, organization, or deal.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `TRACKING_BASE_URL` | **Required for production.** Public origin of your API (no `/api` suffix), e.g. `https://apps.mathionix.tech`. Used for tracking pixel and link URLs. Falls back to `CRM_OAUTH_PUBLIC_URL`, `PUBLIC_API_URL`, `API_URL`, then `http://localhost:4000`. |

> **Important**: Recipients' mail clients must reach this URL. Use the same backend + database that creates tracking rows when you send (live board: `https://apps.mathionix.tech`). Pure local Mongo + live `TRACKING_BASE_URL` will not record opens — use ngrok to your local API instead.

---

## Reducing Spam / Improving Deliverability

### What the App Does

- **Message-ID**: Unique per email; helps threading and spam scoring.
- **X-Mailer**: Identifies the sending application.
- **Precedence: auto**: Marks as transactional/automated mail.
- **List-Unsubscribe**: On **new** CRM sends (not in-thread replies), adds a `List-Unsubscribe: <mailto:…>` header. The mailbox is **`UNSUBSCRIBE_EMAIL`** if set, otherwise the **sending inbox address** (so Gmail/Outlook can show their native unsubscribe UI).
- **Visible opt-out footer**: Same new sends get an HTML block with “click here to unsubscribe” (`mailto:` with subject `Unsubscribe`) plus plain-text instructions. Skipped on conversation replies so threads stay clean. Templates can set `data-crm-compliance-footer` on a block to skip auto-append if you already include your own.
- **Multipart**: Sends both HTML and plain-text alternatives.

### DNS Records (You Must Configure)

Configure these records for the domain you send from (e.g. `yourdomain.com` or your SMTP provider's domain):

1. **SPF (Sender Policy Framework)**  
   - TXT record: `v=spf1 include:_spf.google.com ~all` (for Gmail) or your provider's SPF.  
   - Tells receivers which servers can send for your domain.

2. **DKIM (DomainKeys Identified Mail)**  
   - Your SMTP provider (Gmail, SendGrid, etc.) supplies DKIM keys.  
   - Add the TXT record they provide to your DNS.

3. **DMARC**  
   - TXT record: `_dmarc.yourdomain.com` with `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` (start with `p=none` for monitoring).

### Best Practices

- Use a verified SMTP provider (Gmail, SendGrid, Postmark, etc.) instead of raw SMTP from a new IP.
- Avoid spam trigger words (FREE, ACT NOW, etc.) in subject lines.
- Keep a healthy sender reputation by avoiding high bounce/complaint rates.
- For inbox accounts: Gmail/Outlook already have good reputations; custom domains need proper SPF/DKIM/DMARC.

### Optional Env Vars

| Variable | Description |
|----------|-------------|
| `UNSUBSCRIBE_EMAIL` | Optional dedicated mailbox for opt-outs (e.g. `unsubscribe@yourdomain.com`). If unset, List-Unsubscribe and the visible footer use the **sender’s connected CRM inbox** address. |
