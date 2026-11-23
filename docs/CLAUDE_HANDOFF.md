# Claude handoff — Store Market / DzairMarket

## Objective
Finish the existing Algerian multi-vendor marketplace in this repository. Do not replace it with a new starter or create a new database. Preserve existing users/data and the current Cloudflare Pages project.

## Repository
- GitHub: https://github.com/Store-market/Store-Market-
- Target branch: main
- Current reviewed commit: fd4efd5b3f5a4fd29555482625ecabd172ea2d69
- Cloudflare Pages project: store-market-dz
- Production URL: https://store-market-dz.pages.dev/
- Preview deployment URL previously reported: https://ff39ff18.store-market-dz.pages.dev/
- Wrangler config: wrangler.toml
- D1 database name: store-market-db
- D1 database ID: f9e8784d-ba01-462d-b8c9-a0aea52706c9
- D1 binding expected by API: DB
- Workers AI binding expected by API: AI

## Verified facts from repository inspection
- package.json build command is `tsc --noEmit && vite build`.
- A GitHub Actions build log for commit fd4efd5 reports successful TypeScript and Vite build; 1,580 modules transformed.
- That log also reported 6 npm audit findings (1 low, 5 high). Review and fix safely; do not run broad dependency upgrades without testing.
- `functions/api/[[path]].js` implements auth, customer/seller/owner APIs, order flow, AI chat, and Brain task APIs.
- `migrations/0001_initial.sql` defines users, sessions, products, orders, order_items, and stock triggers.
- `migrations/0002_store_market_brain.sql` defines seven Brain tables. Runtime helper `ensureBrainSchema` also creates these tables.
- `wrangler.toml` contains D1 binding DB and AI binding.
- AI code supports Cloudflare Workers AI and Anthropic Messages API. Default Claude model is `claude-sonnet-5`.
- Owner creation endpoint is POST /api/setup-owner and requires server-side OWNER_EMAIL and OWNER_SETUP_KEY; owner password is supplied only in the secure request body. Never put secrets in Git or browser code.
- The app's AI chat currently requires an authenticated user because the API resolves currentUser before the /ai/chat route.
- The checkout is explicitly demo COD only (`cod_demo`); no real payment or courier integration exists.
- Social accounts are not connected. OAuth/API integrations must be official and least-privilege.
- Publishing, sending messages/replies, changing prices/stock, deleting content, and paid ads must remain behind explicit owner approval. Do not scrape behind login, evade platform restrictions, or reuse creators' media without permission.

## Work required — do these in order
1. Inspect the complete current source and Cloudflare deployment configuration. Confirm which branch and commit are actually deployed. Do not assume GitHub build success means Pages deployment succeeded.
2. Verify D1 binding DB in the actual Pages production environment and run a read-only SELECT 1. Do not create another database or reset existing data.
3. Inspect whether migration 0001 has been applied. Apply it only if missing, in a safe/idempotent way. Verify all seven Brain tables and indexes; do not rely only on an unauthenticated health endpoint to mutate schema.
4. Securely configure OWNER_EMAIL=amgouss3@gmail.com and OWNER_SETUP_KEY as Cloudflare secrets/vars. Do not request or expose secret values in chat, source files, logs, or browser storage. Create the owner account through a secure one-time setup flow; delete/disable OWNER_SETUP_KEY immediately afterwards. Do not invent a password.
5. Verify Workers AI binding and run a minimal server-side test. If using Anthropic, verify the configured API key securely and call a current supported model. Never claim Claude works unless a live request succeeds.
6. Add a safe AI status screen in the owner dashboard showing configured/unconfigured and provider without exposing secrets. Fix any API/auth issues found.
7. Test customer registration/login, seller application/approval, product submission/approval, stock-safe order creation, customer order history, owner order management, Brain task creation/run, approval queue, and audit records.
8. Clearly label demo functionality. Do not represent demo COD as payment processing.
9. Only integrate social platforms using official OAuth/APIs. Store tokens only in encrypted secrets, never D1 plaintext or browser storage. Draft content only until owner approval.
10. Integrate real payments/delivery only after selecting providers and completing their official onboarding/configuration. Keep them disabled until live end-to-end tests pass.
11. Run build, automated tests, security checks, and a real production smoke test. Report exact commit SHA, deployment URL/ID, and test evidence. If blocked by missing Cloudflare account permissions or secrets, state the single precise action needed and stop rather than asking the owner to perform a sequence of technical steps.

## Operating constraints
- Do not delete, reset, or recreate the existing D1 database.
- Do not merge or deploy unreviewed changes without explicit owner approval.
- Do not expose secrets or ask the owner to paste secrets into chat.
- Do not claim a feature is complete without a successful test.
- Prefer incremental, reversible changes and document every migration.
