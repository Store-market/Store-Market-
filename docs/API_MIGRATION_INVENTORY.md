# API Migration Inventory — Cloudflare Functions to Supabase/Vercel

Read-only route inventory from `functions/api/[[path]].js` on `main`. This is an initial porting checklist; implementation and live behavior are not verified.

## Route inventory

| Route | Method | Access / notes |
|---|---|---|
| `/api/health` | GET | Public health/schema check; read-only |
| `/api/setup-owner` | POST | Bootstrap-only; secret header + configured owner email; one-owner gate |
| `/api/auth/register` | POST | Registration |
| `/api/auth/login` | POST | Password login and session cookie |
| `/api/auth/logout` | POST | Session removal |
| `/api/auth/me` | GET | Current session |
| `/api/products` | GET | Public catalog |
| `/api/brain/system-status` | GET | Owner-only Brain status |
| `/api/brain/overview` | GET | Owner dashboard |
| `/api/brain/tasks` | GET | Owner task listing |
| `/api/brain/tasks` | POST | Owner creates task |
| `/api/brain/tasks/:id/run` | POST | Owner task run; AI request |
| `/api/brain/approvals` | GET | Owner approval queue |
| `/api/brain/approvals` | POST | Owner creates approval request |
| `/api/brain/approvals/:id` | PATCH | Owner approval/rejection action |
| `/api/brain/drafts` | GET | Owner content drafts |
| `/api/brain/drafts` | POST | Owner creates draft |
| `/api/brain/social` | GET | Owner social connection status |
| `/api/ai/status` | GET | AI provider status |
| `/api/ai/chat` | POST | Authenticated AI chat |
| `/api/seller/products` | POST | Seller product creation |
| `/api/orders` | POST | Buyer order creation |
| `/api/seller/orders` | GET | Seller-scoped orders |
| `/api/customer/orders` | GET | Customer-scoped orders |
| `/api/admin/orders` | GET | Owner/admin order list |
| `/api/admin/orders/:id` | PATCH | Owner/admin order update |
| `/api/admin/overview` | GET | Owner/admin summary |
| `/api/admin/sellers` | GET | Owner/admin seller list |
| `/api/admin/sellers/:id` | PATCH | Owner/admin seller review/update |
| `/api/admin/products` | GET | Owner/admin product review list |
| `/api/admin/products/:id` | PATCH | Owner/admin product review/update |

## Backend porting requirements

- Replace Cloudflare D1 prepared statements with Supabase Postgres queries or RPCs; keep SQL parameterization.
- Decide whether the server-side API lives in Vercel server routes or Supabase Edge Functions. Keep one authoritative API surface and avoid duplicate business logic.
- Do not expose Supabase service-role credentials in the browser. Use anon/public key with RLS for safe client access; privileged server operations must use server-only secrets.
- Map role checks (owner/admin/seller/buyer) and verify each endpoint's authorization in server-side code, not only UI.
- Migrate password/session handling carefully. The current API uses PBKDF2-SHA256 (210,000 iterations), hashed session IDs, a 7-day HttpOnly/Secure/SameSite=Lax cookie. Prefer Supabase Auth if migrating; if custom sessions are retained, document rotation, revocation, expiry, CSRF/origin safeguards, and recovery.
- Add rate limiting for registration, login, owner bootstrap, AI chat, and Brain task-run endpoints.
- Keep order price totals server-calculated, stock checks atomic, and order/stock updates transactional.
- Brain task/approval/draft/social schema is currently created by API-side `ensureBrainSchema`; migration must replace this with reviewed migration files, not request-time schema DDL.
- AI currently supports Cloudflare Workers AI and Claude provider routing; move to approved provider(s), validate budgets, protect secrets, and provide fallback/error handling.
- Approval queue must remain approval-gated. Social publishing, sending messages, ad launch, and other external actions are not verified as connected or executed.
- Health endpoint should check app dependencies without modifying schema.

## Testing gates

- Auth: signup/login/logout/session expiry, role escalation prevention, owner bootstrap lock, abuse/rate-limit behavior.
- Catalog: search/filter/pagination, seller ownership, pending review, product update permissions.
- Orders: correct server pricing, quantity bounds, stock race conditions, atomic stock/order transaction, scoped reads.
- Admin: seller/product review and order status transition authorization.
- Brain: task creation/run failures, audit log, approval expiry/rejection, no external action without approval.
- Security: RLS, server-side privileged keys, CSRF/origin, injection, secret leakage, logs, rate limits.
- Migration: compare row counts and referential integrity; backup and rollback before any data transfer.

## Not yet done

No routes have been ported. No data has been copied or changed. No Vercel project is linked and no preview or production deployment is running.
