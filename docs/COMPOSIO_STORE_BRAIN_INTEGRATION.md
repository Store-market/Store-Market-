# Store Market Brain — Composio Integration Plan

Last reviewed: 2026-11-28

## Verified available integrations
- GitHub connection: active; Store-market repositories accessible.
- Gmail: active; profile-only connectivity verified. Do not access message contents unless a task explicitly requires it.
- TinyFish: live web search and URL-fetch capability verified.
- Browser Use: read-only navigation smoke test verified.
- Mistral: connection status reported as limited; discover actual tool scope before routing.
- Google Drive: not connected through Composio.

## Store Market Brain workflow

1. **Request intake:** classify merchant/customer request (catalog, product research, customer support, marketing, analytics, admin).
2. **Plan:** create task steps with dependencies and estimated risk.
3. **Specialist assignment:** Catalog, Research, Content, Customer Support, Analytics, Security.
4. **Evidence-first:** use approved catalog/order sources; external product facts require source links and freshness.
5. **Draft-only by default:** product copy, social posts, price/stock changes, customer replies and campaigns are drafts.
6. **Approval gate:** owner previews destination, content, and proposed action; publishing, messaging, price/stock edits, ads, deletion, or spending require approval.
7. **Execution:** use official APIs or authorized connectors; browser automation only when permitted and API access unavailable.
8. **Verification:** confirm action result, record evidence, and provide summary.
9. **Checkpoint:** store task status, steps, errors, approval record, and redacted evidence so work can resume.

## Suggested initial Composio capabilities
- Gmail profile/status check (not mailbox content by default).
- GitHub repository read and approved commit/PR workflow.
- TinyFish search/fetch for public product and market research.
- Browser Use for public-site inspection; sensitive or write actions are approval-gated.
- Do not enable Google Drive capabilities until its connection is active.
- Discover Mistral tool scope before use.

## Connection health labels
- Connected & verified: tested capability works.
- Connected, scope unknown: connection exists, but exact tools not yet discovered/tested.
- Not connected: do not route actions there.
- Degraded/failed: preserve task checkpoint and use only an approved fallback.

## Owner controls
- Global pause.
- Per-provider enable/disable.
- Task cancel.
- Approval inbox.
- Cost/usage limit.
- Audit log.
- Data-sharing and retention controls.

## Not yet implemented
These are plans, not live features: Composio backend adapter, provider credentials in secure server configuration, automatic task routing, approval UI, durable task queue, health monitoring, and production integration tests.
