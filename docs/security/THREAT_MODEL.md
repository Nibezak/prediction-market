---
title: Slimefish threat model
---

# Slimefish threat model

## Security boundaries

Protected assets include identities, sessions, staff permissions, balances, ledger entries, positions, market state, resolution decisions, payment credentials, provider webhooks, audit evidence, and personal data. Trust boundaries exist between the browser, Tellwise, Firebase, Slimefish ledger, PostgreSQL, Supabase Storage, payment providers, and staff workstations.

## Account takeover

Threats: credential stuffing, stolen Google sessions, phishing, session theft, email takeover, MFA recovery abuse, and profile-linking mistakes.

Controls: Firebase token verification on the server, HttpOnly application sessions, short session lifetime and rotation, authenticator MFA, login audit records, rate limits, sensitive-action reauthentication, no Google-photo import by default, and role/permission checks from the database on every privileged request.

Required validation: revoke a Firebase account and verify application sessions stop working; test password reset and MFA recovery; test cross-account linking; verify cookies use Secure, HttpOnly, and appropriate SameSite settings in production.

## Replay

Threats: duplicate trade submission, repeated deposit/withdrawal request, replayed provider webhook, replayed staff action, and reused signed request.

Controls: unique idempotency keys, unique provider event IDs, timestamped HMAC webhooks, deterministic ledger operation IDs, append-only events, and transactional duplicate detection.

Required validation: submit identical requests concurrently and after restart; replay webhooks in and outside the clock window; reorder succeeded, refunded, and dispute events.

## Race conditions

Threats: concurrent trades spending the same cash, simultaneous withdrawals, resolution racing a trade, duplicate liquidity allocation, and two staff members changing market state.

Controls: database transactions, conditional balance updates, row locking in the AMM/ledger service, immutable ledger entries, idempotent jobs, version/state predicates, and close-before-resolve workflow.

Required validation: run high-concurrency trade and withdrawal tests against one account; prove balances never become negative; prove pool invariants and total payout liabilities remain covered.

## Withdrawal abuse

Threats: newly funded rapid withdrawal, account takeover cash-out, amount spikes, destination changes, fragmented withdrawals, provider callback forgery, and withdrawal after a risk hold.

Controls: available-versus-held balance separation, pre-submission reservation, risk holds, velocity and amount rules, destination-change cooling period, verified provider callbacks, staff approval thresholds, durable compensation, and provider reconciliation.

Required validation: fail every stage of a withdrawal; crash workers after provider submission; replay completion callbacks; test hold placement between request and settlement; reconcile ambiguous provider timeouts.

## Insider risk

Threats: unauthorized role grant, user mirroring, balance adjustment, market manipulation, premature close, dishonest resolution, payout approval collusion, audit deletion, and secret access.

Controls: 100 fine-grained permissions, separate mirror/block/finance permissions, passphrase-gated mirroring, visible mirror banner, creator identity derived server-side, multi-person governance, append-only audit records, actor/subject/IP capture, reconciliation, and separation of resolution from payout approval.

Required validation: test every role with default and custom permissions; attempt direct API calls for unchecked capabilities; alert on self-grants, finance changes, mirroring, market close/resolution, and audit-retention changes.

## Residual risk and release gates

Application controls cannot prevent volumetric DDoS before traffic reaches the host, compromise of provider/Firebase/Supabase accounts, malicious database administrators, undisclosed dependency vulnerabilities, or regulatory failure. Before real money, require independent penetration testing, dependency and secret scanning in CI, managed WAF/rate limiting, centralized logs and alerts, encrypted backups with restore drills, provider sandbox and live-pilot certification, financial invariant testing, incident runbooks, and legal/compliance approval for every launch jurisdiction.
