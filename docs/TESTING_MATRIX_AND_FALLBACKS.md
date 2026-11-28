# Store Market test matrix and fallback-tool plan

Updated: 2026-11-28. Source-only planning; live checks remain unrun.

## Test matrix

| Area | Test | Expected |
|---|---|---|
| Public health | GET `/api/health` | 200 only when core schema is ready; read-only |
| AI status | Authenticated GET `/api/ai/status` | Reports configuration boolean/provider only; no secret values |
| Registration | Customer with valid input | 201; active account |
| Registration | Seller registration | 201; seller pending |
| Registration | Unsupported role | 400 |
| Registration | Duplicate email | 409 |
| Authentication | Login valid active user | 200 and secure session cookie |
| Authentication | Invalid password/inactive seller | 401; no session |
| Session | Logout | Session deleted and cookie cleared |
| Access control | Customer calls seller/admin routes | 403 |
| Access control | Seller calls owner/Brain routes | 403 |
| Products | Seller submits product | Pending; not public until owner review |
| Products | Owner activates product | Active product appears in public catalog |
| Orders | Customer submits valid demo COD order | Total computed server-side; COD demo explicitly stated |
| Orders | Quantity exceeds stock | 409; no oversell |
| Orders | Concurrent orders for last stock | Trigger prevents stock below zero; transaction outcome verified |
| Orders | Seller/customer list endpoints | Only own orders returned |
| Brain | Owner creates/runs task with configured AI | Result is recommendation/draft; provider reported |
| Brain | AI unavailable | Safe 503; task/run records show failure |
| Brain approvals | Owner approves pending item | Approval state changes; execution remains not configured |
| Owner | Non-owner calls owner endpoints | 403 |
| Origin/CSRF | Cross-origin state-changing browser request | Should be rejected after explicit Origin/CSRF control is implemented |
| Abuse | Repeated login/register/chat/task requests | Rate limited after platform/app rate-limit implementation |

## Fallback tools and workflows when integrations are unavailable

- GitHub: primary source, review branches, pull requests, file-level edits. Keep changes isolated and reviewed.
- Cloudflare dashboard: use the official dashboard UI if connector scopes are unavailable; inspect Pages deployment and D1 bindings, but do not alter production until the exact setting and database are identified.
- CI: GitHub Actions is the build fallback for local build tooling. Only claim pass when a current run is visible and successful.
- Browser automation: use a connected browser/desktop tool only if its authorization and target site are available. If unavailable, provide a reproducible manual test route and do not claim browser actions were performed.
- AI provider: code has auto-routing/fallback between Workers AI and Anthropic when configured; provider availability and credentials must be verified in environment, not assumed.
- Replit: the existing project inspection tool has returned no usable report; treat it as unavailable for code comparison. Keep the GitHub repository as source of truth until inspection works.

## Safe release sequence

1. Verify Cloudflare Pages project/branch/commit from dashboard or authorized connector.
2. Verify D1 binding name `DB` and target database identity; run read-only checks first.
3. Verify migration state. Apply only missing migrations using a controlled process; never reset/recreate.
4. Securely configure owner setup and remove the one-time key immediately after use.
5. Verify AI binding/configuration with non-sensitive test prompt.
6. Run test matrix in staging/safe environment.
7. Review PR diff and successful CI before merge.
8. Deploy approved commit, then perform public health smoke check.
9. Enable commercial workflows only after payment/delivery integrations and operational support are ready.
