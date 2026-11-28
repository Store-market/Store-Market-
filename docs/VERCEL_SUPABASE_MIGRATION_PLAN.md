# Vercel + Supabase Migration Plan (DzairMarket)

## Status
Planning only. No application code, production data, credentials, or deployments were changed by this document.

## Target architecture
- **Frontend hosting:** Vercel, pending GitHub repository authorization and project-link verification.
- **Database/auth/storage:** Existing Supabase project `Marketplace dz` (project ref `cpfycnghhohaanxxbdgn`), reuse after schema/API compatibility review.
- **Application API:** Supabase Edge Functions or a separate server-side API on Vercel. Choose one owner for privileged operations; avoid duplicate endpoints.
- **AI manager:** AMG Brain, with tool actions gated by owner approvals, audit logs, and least-privilege credentials.
- **Payments:** COD-only for initial launch. Online payment providers are future integrations and must not be represented as live.
- **Cloudflare:** Removed from the primary target architecture; legacy D1/Cloudflare Functions remain until migration is completed and tested.

## Current observed state
- GitHub main includes a React + TypeScript + Vite client and Cloudflare Pages Functions/D1 API.
- Existing Supabase project is active and has marketplace tables including wilayas, profiles, user_roles, categories, stores, products, orders, order_items, agent_logs and Telegram-link tables. RLS is enabled on the listed tables.
- Existing Supabase data must be preserved. No duplicate schema should be created before comparing current app migrations with Supabase schema.
- Vercel connector currently shows no DzairMarket project and the attempted repository link failed because the Vercel GitHub app lacked repository access.

## Migration sequence (gated)
1. **Repository access:** authorize Vercel GitHub integration for `Store-market/Store-Market-`. Confirm repo appears in Vercel before creating a project.
2. **Baseline & inventory:** document every Cloudflare Function route, request/response contract, auth/session behavior, D1 query, scheduled/background task, and Brain endpoint.
3. **Schema mapping:** compare D1 migrations with Supabase schema, identify mismatches, indexes, triggers, enum/status differences, and data ownership. Do not overwrite Supabase tables.
4. **Backend choice:** select Supabase Edge Functions or Vercel server routes as the single API implementation. Record why and how secrets are managed.
5. **Auth migration:** map existing cookie/session behavior to Supabase Auth or a secure server-managed session. Preserve roles and owner setup safeguards. Do not expose service-role keys in browser code.
6. **API migration:** port routes incrementally behind a feature branch; validate authorization, validation, pagination, rate limits, CSRF/origin safeguards where cookie auth is used, and audit logging.
7. **Data safety:** plan any D1 data transfer only after schema mapping; test idempotency, reconciliation counts, backups, and rollback. Never perform destructive migration on production without a verified backup and explicit authorization.
8. **Testing:** unit/integration tests for auth, seller permissions, owner permissions, catalog, stock, order totals, status transitions, approval workflow, and API error paths; run build and automated tests.
9. **Preview verification:** create a Vercel preview only after the repository integration is authorized. Verify environment variables are present without displaying secrets, preview auth, database connectivity, and logs.
10. **Launch gate:** production deploy remains blocked until security review, migration reconciliation, test evidence, owner access recovery, and rollback procedure are approved.

## Required environment configuration (names only; values must remain secret)
- Supabase URL and anon/public key (browser-safe, subject to RLS).
- Supabase service-role key only for server-side privileged code, never frontend.
- AI provider/model configuration and budgets.
- Session/auth settings and owner bootstrap controls.
- Optional integrations (email, storage, delivery, payments) only when enabled and verified.

## Acceptance checklist
- [ ] Vercel repository access granted and confirmed.
- [ ] Vercel project linked to correct repository and production branch.
- [ ] Existing Supabase schema reviewed and matched to app domain.
- [ ] API/backend ownership decided; no duplicate or conflicting routes.
- [ ] Auth/roles and RLS tests pass.
- [ ] Catalog, seller, buyer, order, stock, and Brain approval tests pass.
- [ ] No secrets in client bundle, repository, logs, or screenshots.
- [ ] Preview environment verified; production rollback documented.
- [ ] Real payment/delivery integrations are clearly disabled until verified.

## Current blockers
- Vercel GitHub integration needs repository access to `Store-market/Store-Market-`.
- Cloudflare/D1 API implementation has not yet been ported.
- Existing Supabase schema needs compatibility mapping against D1 migrations.
- Live deployment, API runtime, and payment/delivery integrations are not verified.
