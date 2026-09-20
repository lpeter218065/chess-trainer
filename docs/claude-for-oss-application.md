# Claude for Open Source — application draft (chess-trainer)

Program: https://claude.com/contact-sales/claude-for-oss  
Offer: 6 months of Claude Max 20x  
Repo to select: https://github.com/lpeter218065/chess-trainer  
Terms: https://www.anthropic.com/claude-for-oss-terms

## Form fields (fill in this order)

| Field | Required | Suggested value |
|-------|----------|-----------------|
| First name | yes | Ruiqing |
| Last name | yes | Xu |
| Email | yes | Your **Claude.ai account** email (page says: if existing user, use account email). GitHub public profile currently lists `lpeter82218065@gmail.com` — only use that if it is also your Claude login. |
| Select repo on GitHub | yes | OAuth → choose `lpeter218065/chess-trainer` (Submit stays disabled until this succeeds) |
| Tell us about the project's reach and impact | yes | Paste **Reach & impact** below |
| How will you use the subscription for your project | yes | Paste **How you'll use Claude Max** below |
| Other info | no | Paste **Other info** below |

## Honesty check vs stated eligibility

Official bars (maintainers with large dependents, foundation committers, 100+ external merged PRs/12mo, 20+ external contributors, OpenSSF ≥ 0.4) are **not** met by chess-trainer today:

- Public GPLv3, created ~2026-09-18 as `chess-trainer` (also older `chess` mirror)
- ~1 star, 0 forks, solo maintainer (`lpeter218065` / Xu Ruiqing)
- ~63 commits; no significant external contributors
- No npm/PyPI package with dependents; not foundation infrastructure
- GitHub search: ~0 merged PRs into other people's repos in the last 12 months

The page explicitly allows: *“Don't quite fit? If you maintain something the ecosystem quietly depends on, apply anyway and tell us about it.”*  
Draft below leans on that path (GPLv3 Stockfish redistributor + local-first OSS chess trainer). Approval is uncertain; do not overclaim metrics.

---

## Reach & impact (paste)

chess-trainer (https://github.com/lpeter218065/chess-trainer) is a free/libre GPLv3 chess training app for Web and iOS. Learners play from curated opening/middlegame/endgame lesson positions against an embedded Stockfish engine, then get move explanations, hints, and post-game summaries from a user-configured OpenAI-compatible LLM. There is no proprietary backend: progress and settings stay on-device (IndexedDB/localStorage on Web; Preferences + Keychain on iOS).

The project redistributes Stockfish under GPLv3 (official engine + stockfish.js WASM port) and publishes full app source, lesson data, and a generated third-party license page in-app. Bundle ID: `dev.xu.chesstrainer`. Current release line is around v0.3.3 (iOS builds continuing through TestFlight). Stack: React + Vite + Capacitor + chess.js + Stockfish.

Reach today is early (public repo, small star count, solo maintainer). The gap it fills is practical: an end-to-end, local-first open source trainer that couples a strong libre engine with BYO LLM coaching, without locking users into a hosted AI vendor or uploading game data to our servers. We are applying under the “don’t quite fit / ecosystem quietly depends on it” path as a GPLv3 Stockfish redistributor and open training client rather than claiming foundation-scale download numbers.

## How you'll use Claude Max (paste)

I will use the complimentary Claude Max subscription as the primary coding and design partner for chess-trainer’s open development: implementing and reviewing lesson/content pipelines, improving Stockfish↔UI flows and the review/summary experience, hardening the Capacitor iOS path (SSE plugin, secure storage, App Store release notes), writing tests and release checklists, and drafting contributor docs so others can add lessons and principles. Claude will also help keep the GPLv3 compliance story accurate (engine attribution, license generation, in-app licenses page) and triage community issues as they appear. The subscription stays tied to this OSS repo’s roadmap, not closed-source product work.

## Other info (paste)

Applicant: Xu Ruiqing (GitHub: lpeter218065). Company on GitHub profile: MSTR. Primary repo for this application: lpeter218065/chess-trainer (GPLv3). Related public repo: lpeter218065/chess (same product lineage). Happy to provide TestFlight / build evidence or a short demo video if useful. I understand the program’s main eligibility bars and am applying via the “apply anyway” path for a small but fully open GPLv3 training client that ships Stockfish to end users.

