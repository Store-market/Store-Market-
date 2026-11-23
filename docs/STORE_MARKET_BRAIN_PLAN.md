# Store Market Brain — implementation plan

## Product goal
Store Market Brain is the store's AI operations manager. It coordinates specialist agents, proposes work, records every task, and keeps the owner in control. It is not a replacement for the owner and must not claim that external integrations are active until credentials, permissions, and live tests succeed.

## Agent roles
1. **Manager Agent** — triages requests, creates tasks, assigns specialist agents, tracks dependencies, and prepares an owner-facing summary.
2. **Catalog Agent** — drafts product titles, descriptions, categories, translations, attributes, and SEO metadata from seller-provided or explicitly authorized source material.
3. **Social Discovery Agent** — monitors only official APIs, approved feeds, or URLs/accounts that the owner has authorized. It stores source URL, creator, license/permission evidence, and media attribution.
4. **Content Studio Agent** — creates original campaign copy and platform-specific creative variants; it must not copy protected images/video/text without permission.
5. **Approval Agent** — checks product claims, prices, stock, attribution, platform rules, and brand safety; routes all publishing actions to owner approval.
6. **Customer Support Agent** — drafts answers from verified catalog/order data; cannot promise refunds, delivery dates, or payment status without evidence.
7. **Analytics Agent** — summarizes catalog quality, sales, traffic, campaign performance, and outstanding tasks.
8. **Security & Audit Agent** — checks permissions, secrets hygiene, suspicious activity, and audit trails.

## Social sourcing and publishing policy
- No password collection, scraping behind login, bypassing rate limits, or automation that violates a platform's terms.
- Connect Instagram, Facebook, TikTok, YouTube, Pinterest, and other networks only through their official OAuth/API integrations where the platform grants the required permissions.
- A candidate may be imported only from an authorized public URL/API/feed or content supplied by the seller/owner.
- Reuse of another creator's media requires a recorded license or explicit permission. Otherwise the agent may save the reference URL and create a new original post; it must not download/repost the creator's media.
- Every proposed post includes destination, copy, media rights/attribution, product links, schedule, and a preview.
- Publishing, replying publicly, messaging, spending on ads, changing prices/stock, and deleting content are **approval-gated**. The owner sees a preview and explicitly approves each action. No silent auto-publishing.
- Free operation means no paid ads or paid third-party APIs are assumed. Platform API availability, quotas, and eligibility vary.

## Task lifecycle
`queued -> assigned -> running -> needs_approval -> approved -> completed`
Alternative terminal states: `rejected`, `failed`, `cancelled`.
Each task records agent, input references, output summary, timestamps, retries, approval actor/time, and audit events. Retries must be bounded and idempotent.

## Implementation tasks
- [ ] Bind existing Cloudflare D1 database to Pages runtime as `DB`; verify `/api/health`.
- [ ] Apply and verify the current initial migration on that database without duplicating existing tables.
- [x] Create D1 migration `migrations/0002_store_market_brain.sql` for task queue, agent runs, social connection metadata, content drafts, approval requests, and audit events (still must be applied to the live D1 database).
- [ ] Implement owner-only APIs for task creation, assignment, status, approval/rejection, and audit history.
- [ ] Add Brain dashboard: task inbox, agent status, approvals, failed jobs, activity log, and cost/usage visibility.
- [ ] Add scheduled worker/cron dispatcher with bounded retries and a kill switch.
- [ ] Add official OAuth connectors one platform at a time; request least-privilege scopes and store tokens only as encrypted server-side secrets.
- [ ] Add social discovery from approved public sources and content-rights/attribution records.
- [ ] Add content calendar and preview-first approval workflow.
- [ ] Add platform-specific publishing only after official API access is granted and tested.
- [ ] Add integration tests, permission tests, rate limits, data-retention rules, and incident/revocation controls.
- [ ] Complete end-to-end acceptance tests before describing the store as commercially operational.

## Initial acceptance criteria
- The owner can see all tasks and agent activity in one dashboard.
- Agents can draft, classify, translate, research authorized public content, and prepare recommendations without publishing.
- A public post cannot be sent unless an owner approval record exists for the exact content and destination.
- Social tokens never appear in client bundles, Git history, logs, or chat.
- Every imported asset has a source and rights status; unknown rights means no repost.
- All actions can be paused globally by the owner.
- Unconfigured integrations are visibly marked "not connected"; demo data is clearly labeled.
