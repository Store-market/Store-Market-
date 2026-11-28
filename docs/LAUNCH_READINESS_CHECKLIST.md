# DzairMarket / Store Market — Launch readiness checklist

This checklist tracks **verified** status separately from planned work. It does not authorize production deployment, data migrations, or destructive changes.

## Current known status (reviewed 2026-11-28)

- [x] Primary source repository identified: `Store-market/Store-Market-`
- [x] Main branch and existing app structure inspected
- [x] React + TypeScript + Vite storefront exists
- [x] Arabic/French interface and RTL/LTR support exist
- [x] Catalog, search, categories, cart UI exist
- [x] Customer registration/login/session API exists in code
- [x] Seller application/product submission flows exist in code
- [x] Owner/admin review flows exist in code
- [x] Demo cash-on-delivery order flow exists in code
- [x] D1 schema/migrations for marketplace and Brain foundation exist
- [x] Brain task/agent/approval schema and UI/API foundations exist
- [x] CI workflow definition exists for npm install + npm run build
- [ ] CI success on current HEAD independently verified
- [ ] Cloudflare Pages deployed branch/commit independently verified
- [ ] Cloudflare Pages connector permissions fixed (Pages Read/Write)
- [ ] D1 binding confirmed on live Pages environment with read-only query
- [ ] Migrations 0001 and 0002 checked/applied safely (no reset/recreate)
- [ ] Owner setup completed securely and one-time setup key disabled
- [ ] Workers AI/Claude live request verified server-side
- [ ] Live registration/login/logout tested
- [ ] Seller submission and owner review tested
- [ ] Product publishing and catalog display tested
- [ ] Stock guard and order creation tested
- [ ] Admin authorization and session expiration tested
- [ ] Brain task run, failure handling, and approval behavior tested
- [ ] Social OAuth/API integration implemented and tested (official APIs only; approval required)
- [ ] Payment provider integration implemented and tested (not demo COD)
- [ ] Delivery provider integration and tracking implemented/tested
- [ ] Security review, backup/recovery, and production acceptance completed

## Release acceptance tests

1. Build: `npm run build` exits successfully on the exact release commit.
2. Health: live `/api/health` confirms expected service and DB connectivity.
3. Authentication: register, login, logout, session expiry and role enforcement verified.
4. Seller: seller request and product submission; owner review; active product appears publicly.
5. Orders: server recomputes prices, validates inventory, and rejects insufficient stock; demo COD clearly labeled.
6. Owner: owner-only endpoints reject non-owner sessions.
7. Brain: AI status reports configured/unconfigured without exposing secret values; failed providers produce safe errors; external actions require owner approval and audit logging.
8. Deployment: Pages deployed commit equals reviewed commit; smoke tests run on deployed URL.
9. Recovery: documented D1 backup/restore path tested before commercial launch.

## Non-negotiable safety and data rules

- Never reset, drop, recreate, or duplicate the existing production D1 database.
- Never commit passwords, API keys, tokens, session cookies, or owner setup secrets.
- Never deploy/merge unreviewed changes to production.
- Never treat approval records as proof that an external action executed.
- Use official platform OAuth/APIs and least privilege; no scraping or login bypass.
- Payments, delivery, social publishing, and messaging must be clearly disabled until live provider setup and verification are complete.

## Next blockers

1. Reauthorize Cloudflare connector with Pages Read and Pages Write scopes.
2. Verify the current Pages project and deployment without modifying production.
3. Reconcile Replit features only after its source inspection produces a usable report.
4. Run and document tests against a safe environment; then prepare a reviewed release candidate.
