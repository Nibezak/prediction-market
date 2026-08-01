---
title: Payment lifecycle
---

# Payment lifecycle

Slimefish treats the internal ledger as the source of truth for spendable funds. A payment provider is an adapter that moves external value; it never mutates a user balance directly.

## State model

`created -> pending -> processing -> succeeded`

Terminal failure paths are `failed`, `cancelled`, `refunded`, and `reversed`. Disputes are tracked separately so a provider dispute cannot overwrite the original payment history.

Deposits credit the ledger only after a verified `payment.succeeded` webhook. Withdrawals reserve or debit funds before provider submission, then either complete or enqueue a durable compensation job that releases the reservation. Client responses are not settlement evidence.

## Idempotency

- Every client payment request requires an idempotency key scoped to the authenticated user and operation.
- `payment_intents.idempotency_key` is unique.
- Every provider webhook is unique on `(provider, provider_event_id)`.
- Internal ledger calls use deterministic operation IDs derived from the payment intent and event type.
- Replayed webhooks return the stored processing result and do not post a second ledger transaction.
- Provider report IDs are unique per provider so the same report cannot be reconciled twice.

## Webhook verification

Providers call `POST /api/payments/webhooks/{provider}` with:

- `x-provider-event-id`
- `x-provider-timestamp` as Unix seconds
- `x-provider-signature` as hex HMAC-SHA256 of `{timestamp}.{rawBody}`

The route enforces a five-minute clock window, constant-time signature comparison, a 256 KB body limit, provider-name normalization, and an environment-specific secret. Configure `PAYMENT_WEBHOOK_SECRET_{PROVIDER}` or the fallback `PAYMENT_PROVIDER_WEBHOOK_SECRET`.

Raw webhook signatures and secrets are never persisted. The database stores payload and signature digests for audit evidence.

## Reversals, refunds, and disputes

- Refunds and reversals post a compensating ledger operation; ledger rows are never edited or deleted.
- A lost dispute debits the internal ledger idempotently and records the provider dispute ID.
- Open disputes remain independent records with evidence and timestamps.
- Insufficient funds during a reversal or dispute is an exception requiring a risk hold and operator review; it must not be silently discarded.

## Reconciliation

`POST /api/admin/payments/reconcile` requires `finance.reconcile`. Reports contain provider, report ID, records, and optionally a half-open `from`/`to` period. The comparison checks external reference, amount, currency, and status. A supplied period also finds successful internal payments absent from the provider report.

Reconciliation output is immutable operational evidence. Exceptions must be investigated before funds are released or accounting periods are closed.

## Provider adapter checklist

- Map provider states to the Slimefish state model.
- Verify the provider's real signature specification and IP/TLS requirements.
- Confirm amount units, rounding, currencies, fees, and timezone semantics.
- Implement status lookup for ambiguous timeouts.
- Exercise duplicate, delayed, reordered, malformed, and forged webhooks.
- Exercise provider outage, reversal, refund, dispute, and reconciliation fixtures.
- Run a low-value live pilot before enabling broad access.
