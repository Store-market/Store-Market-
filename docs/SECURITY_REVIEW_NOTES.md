# Store Market API — static security review notes

Review date: 2026-11-28  
Reviewed source: `functions/api/[[path]].js` and `migrations/0001_initial.sql` on `main`.  
Scope: source inspection only. No live deployment, database, traffic, or external security testing was performed.

## Positive controls observed in source

- Passwords are PBKDF2-SHA256 hashed with a random 16-byte salt and 210,000 iterations.
- Session IDs are random 32-byte values; only SHA-256 digests are stored in D1.
- Session cookie is `HttpOnly; Secure; SameSite=Lax` with a seven-day max age.
- Public health endpoint performs a read-only database query and reports schema readiness, not secret values.
- Owner setup requires configured owner email and setup key; it refuses when an owner already exists and enforces a 12-character minimum for the owner password.
- Registration accepts only customer/seller roles; seller accounts begin pending.
- AI instructions prohibit claims about unverified inventory/payment/delivery and prohibit sensitive/external actions.
- Brain routes require owner role; task-run prompts constrain agents to recommendations/drafts.
- Approval responses explicitly report execution as not configured.
- Order totals are recalculated from server-side active product records, quantities are bounded, and total is checked for safe integer/upper bound.
- D1 trigger checks stock and decrements it during order-item insertion.
- Seller orders query is scoped to the authenticated seller; customer order query is scoped to authenticated customer.
- Admin routes check owner role; seller/product/order status values are allowlisted.
- SQL uses prepared statements/bind parameters for user-supplied values in inspected routes.

## Findings / follow-up items

### 1. No application-level rate limiting visible — follow-up recommended
Registration, login, owner setup, AI chat, and Brain task execution have no rate limiter in the inspected handler. Cloudflare-level protections may exist but were not verified. Add provider/platform rate limiting and monitor abuse before public launch.

### 2. Explicit request-origin / CSRF checks not visible — follow-up recommended
Cookie uses SameSite=Lax, which is helpful, but state-changing routes do not show explicit Origin/Referer validation or a CSRF token. Review deployment and browser behavior; consider strict Origin allowlisting for state-changing endpoints.

### 3. Owner setup should be verified for safe one-time operational procedure
Code checks for an existing owner and requires setup secret, but deployment setup and removal of `OWNER_SETUP_KEY` are not verified. Use a one-time procedure, confirm owner creation, remove secret, and verify setup endpoint returns an authorization failure thereafter.

### 4. Brain schema is created by owner API requests
`ensureBrainSchema` executes CREATE TABLE/INDEX IF NOT EXISTS statements for owner Brain routes. This is idempotent by design but production migration ownership should be clarified: prefer applying and verifying the documented migration in a controlled deployment process; avoid schema mutation as an implicit side effect of routine requests.

### 5. Provider/API configuration and live behavior remain unverified
Source supports Workers AI and Anthropic, but provider credentials/bindings, model availability, provider error behavior, and production AI latency/cost controls have not been live-tested.

### 6. Approval records do not execute external actions
The reviewed approval PATCH endpoint changes approval/task state and returns `execution: "not_configured"`. Treat approved records as decisions only—not publication, messaging, ads, or price/stock changes.

### 7. Order flow is explicitly demo COD
The API inserts `cod_demo` and returns a message that no money is collected. Payment collection, delivery integrations, and customer contact workflows are not verified.

## Recommended test plan (safe environment)

- Test login failures and registration abuse controls/rate limiting.
- Test Origin handling on all state-changing endpoints.
- Verify setup-owner is unavailable after key removal and cannot create a second owner.
- Test role matrix: customer, pending seller, active seller, owner.
- Test stock guard with concurrent order attempts; verify stock cannot go negative and order batch rollback is correct.
- Verify seller/customer scoped endpoints do not expose other users' records.
- Verify admin routes return 403 for non-owner users.
- Test AI unavailable/invalid provider paths and response size/time controls.
- Confirm production secrets are server-side only and never logged or returned.
- Verify backups and restore procedures before commercial launch.

## Conclusion

The inspected code contains several sound baseline controls, but this is **not a certification or penetration test**. Rate limiting, CSRF/origin controls, live configuration, operational owner setup, backups, and deployed behavior still need verification. Do not treat the site as ready for live payments or full commercial launch until these items are closed.
