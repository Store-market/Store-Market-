# Claude handoff — Store Market / DzairMarket

## Objective
Finish and consolidate the user's Algerian multi-vendor marketplace as one product named **DzairMarket / Store Market**. Treat the current GitHub repository as the primary implementation and preserve its users, data, Cloudflare Pages project, and existing D1 database. Do not replace it with a new starter or create a second database.

## Source projects to reconcile
- Primary implementation (GitHub): https://github.com/Store-market/Store-Market-
- Earlier Marketplace DZ / DzairMarket Replit project: https://replit.com/@amgouss3/LonelyEarnestHack
- Replit app ID: `38ed1772-46c0-4761-8f05-685e23172e67`
- Replit project was last reported updated on 2026-11-19. Inspect it before porting anything; do not assume it is the same codebase or overwrite either project.
- Goal: compare the earlier Marketplace DZ project with the current Store Market implementation, preserve useful business features, flows, copy, and UI, then port only missing compatible features into the GitHub primary implementation. Avoid duplicate modules, duplicate products, or parallel databases.
- Product scope previously requested: a unified Algerian marketplace for new/used products, vehicles, real estate, services, wholesale and local commerce; customer/seller registration and storefronts; product listings, cart, orders and delivery; owner administration; Arabic/French with RTL/LTR; cash on delivery initially, with no paid subscription requirement at launch.
- Social-commerce scope: where permitted, connect Facebook, Instagram, TikTok and other platforms only through their official OAuth/API integrations and required permissions. Allow a seller to convert their own authorized post/media into a product listing; also provide manual URL/text/image submission when a platform API does not allow import. Do not scrape private/login-gated content or bypass platform restrictions, and do not reuse third-party creators' media without permission.
- AI scope: Store Market Brain should coordinate bounded AI agents for catalog assistance, listing drafts, moderation assistance, customer support drafts, store analytics and task planning. External publishing, replies, messages, ads, price/stock changes, deletion, and other consequential actions must remain behind explicit owner approval and an audit trail.

## Repository and deployment
- GitHub: https://github.com/Store-market/Store-Market-
- Target branch: main
- Current inspected commit at handoff creation: 40d9d89c75995896c2f1c8e5441beca569149b86
- Cloudflare Pages project: store-market-dz
- Production URL: https://store-market-dz.pages.dev/
- Wrangler config: wrangler.toml
- D1 database name: store-market-db
- D1 database ID: f9e8784d-ba01-462d-b8c9-a0aea52706c9
- D1 binding expected by API: DB
- Workers AI binding expected by API: AI

## Verified facts from repository inspection
- Build command is `tsc --noEmit && vite build`.
- GitHub Actions for commit 40d9d89c75995896c2f1c8e5441beca569149b86 passed TypeScript and Vite build. This does not prove Cloudflare deployment or production API/D1 health.
- `functions/api/[[path]].js` implements auth, customer/seller/owner APIs, order flow, AI chat, and Brain task APIs.
- `migrations/0001_initial.sql` defines users, sessions, products, orders, order_items, and stock triggers.
- `migrations/0002_store_market_brain.sql` defines Brain task, agent, approval, social-source, content-draft, audit, and social-connection tables.
- AI code supports Cloudflare Workers AI and Anthropic Messages API. The code's default Claude model is `claude-sonnet-5`; do not claim the API is active unless a live server-side request succeeds.
- Claude API integration reads `ANTHROPIC_API_KEY` from Cloudflare server-side secrets. This is not the same as connecting Claude Code to GitHub or granting Claude access to Cloudflare.
- Owner creation endpoint is POST `/api/setup-owner` and requires server-side `OWNER_EMAIL` and `OWNER_SETUP_KEY`. Never put secrets in Git or browser code.
- The checkout is demo COD only (`cod_demo`); no real payment or courier integration exists.
- Social accounts are not connected. OAuth/API integrations must be official and least-privilege.
- The Brain approval UI currently records approval decisions; do not represent external execution/publishing as enabled unless implemented and tested.

## Work required — do these in order
1. Inspect the complete current source and the earlier Replit project. Produce a feature-by-feature comparison first. Identify what already exists, what is missing, and any incompatible/duplicate implementation. Preserve useful earlier Marketplace DZ functionality without replacing the current primary codebase.
2. Inspect Cloudflare deployment configuration. Confirm which branch and commit are actually deployed; do not assume GitHub build success means Pages deployment succeeded.
3. Verify D1 binding DB in the actual Pages production environment and run a read-only SELECT 1. Do not create another database or reset existing data.
4. Inspect whether migration 0001 has been applied. Apply it only if missing, in a safe/idempotent way. Verify all Brain tables and indexes; do not rely only on an unauthenticated health endpoint to mutate schema.
5. Securely configure OWNER_EMAIL=amgouss3@gmail.com and OWNER_SETUP_KEY as Cloudflare secrets/vars. Do not request or expose secret values in chat, source files, logs, or browser storage. Create the owner account through a secure one-time setup flow; delete/disable OWNER_SETUP_KEY immediately afterwards. Do not invent a password.
6. Verify Workers AI binding and run a minimal server-side test. If using Anthropic, verify the configured API key securely and call a currently supported model. Never claim Claude works unless a live request succeeds.
7. Add a safe AI status screen in the owner dashboard showing configured/unconfigured and provider without exposing secrets. Fix any API/auth issues found.
8. Test customer registration/login, seller application/approval, product submission/approval, stock-safe order creation, customer order history, owner order management, Brain task creation/run, approval queue, and audit records.
9. Clearly label demo functionality. Do not represent demo COD as payment processing.
10. Only integrate social platforms using official OAuth/APIs. Store tokens only in encrypted secrets, never D1 plaintext or browser storage. Draft content only until owner approval.
11. Integrate real payments/delivery only after selecting providers and completing their official onboarding/configuration. Keep them disabled until live end-to-end tests pass.
12. Run build, automated tests, security checks, and a real production smoke test. Report exact commit SHA, deployment URL/ID, and test evidence. If blocked by missing Cloudflare account permissions or secrets, state the single precise action needed and stop rather than asking the owner to perform a sequence of technical steps.

## Operating constraints
- Do not delete, reset, or recreate the existing D1 database.
- Do not merge or deploy unreviewed changes without explicit owner approval.
- Do not expose secrets or ask the owner to paste secrets into chat.
- Do not claim a feature is complete without a successful test.
- Prefer incremental, reversible changes and document every migration.
