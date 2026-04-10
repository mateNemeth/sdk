# @tallyroot/sdk

Official TypeScript SDK for the [Tallyroot](https://tallyroot.com) ingest API. Push transactions, FX trades, transfers, and balance snapshots from any data source — a bank connector, a CSV import, a third-party integration — into your Tallyroot workspace.

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
  - [TallyrootClient](#tallyrootclient)
  - [upsertTransactions](#upserttransactions)
  - [upsertFx](#upsertfx)
  - [upsertTransfers](#upserttransfers)
  - [pushBalanceSnapshots](#pushbalancesnapshots)
  - [sendAlert](#sendalert)
  - [IngestResult](#ingestresult)
- [Types](#types)
  - [IngestTransactionUpsert](#ingesttransactionupsert)
  - [IngestFxUpsert](#ingestfxupsert)
  - [IngestTransferUpsert](#ingesttransferupsert)
  - [IngestBalanceSnapshot](#ingestbalancesnapshot)
- [TallyrootApiError](#tallyrootapierror)
- [Error Handling](#error-handling)
- [Money Helpers](#money-helpers)
- [Rate Limits](#rate-limits)
- [Use-Case Guides](#use-case-guides)
  - [Building a bank connector](#building-a-bank-connector)
  - [Syncing from a CSV](#syncing-from-a-csv)
  - [Handling the pending / booked / voided lifecycle](#handling-the-pending--booked--voided-lifecycle)
- [License](#license)

---

## Overview

Tallyroot is a personal finance platform that categorises, analyses, and budgets transactions across all your accounts. The ingest API is the entry point for external data: you authenticate with a workspace API key, describe transactions in a standard envelope, and Tallyroot handles deduplication, categorisation, and ledger reconciliation.

This SDK wraps the ingest API with:

- A typed `TallyrootClient` class for all ingest endpoints
- A structured `TallyrootApiError` with HTTP status, machine-readable code, and retry guidance
- Pure-string money helpers (`toMinor`, `formatMinor`, `negateMinor`) that never touch JavaScript's floating-point numbers

**Requirements:** Node.js 18 or later (uses the built-in `fetch` API and ES modules).

---

## Installation

```sh
npm install @tallyroot/sdk
```

---

## Quick Start

```ts
import { TallyrootClient, toMinor } from '@tallyroot/sdk';

const client = new TallyrootClient({
  apiKey: 'bk_your_api_key_here',
  source: 'my-bank-connector',
});

const result = await client.upsertTransactions([
  {
    externalTxnId: 'txn_abc123',
    accountId: 'acc_checking',
    bookedAt: '2024-03-15T10:30:00Z',
    currency: 'USD',
    amountMinor: toMinor('-45.50', 2), // → "-4550"
    merchantName: 'Corner Coffee Shop',
    bookingStatus: 'booked',
  },
]);

console.log(result);
// { created: 1, skipped: 0, restated: 0 }
```

---

## API Reference

### TallyrootClient

```ts
import { TallyrootClient } from '@tallyroot/sdk';

const client = new TallyrootClient(options);
```

**Constructor options:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiKey` | `string` | Yes | Workspace API key. Always starts with `bk_`. |
| `source` | `string` | Yes | Identifier for the data source (e.g. `"chase-connector"`, `"csv-import"`). Included with every ingest call for traceability. |
| `baseUrl` | `string` | No | Base URL of the Tallyroot API. Defaults to `"https://app.tallyroot.com"`. |

```ts
// Custom base URL (e.g. self-hosted or staging)
const client = new TallyrootClient({
  apiKey: process.env.TALLYROOT_API_KEY!,
  source: 'my-connector',
  baseUrl: 'https://staging.tallyroot.com',
});
```

---

### upsertTransactions

```ts
client.upsertTransactions(transactions: IngestTransactionUpsert[]): Promise<IngestResult>
```

Create or update regular account transactions. Each transaction is identified by `externalTxnId` — if a record with that ID already exists, it is updated in place; otherwise a new record is created.

```ts
const result = await client.upsertTransactions([
  {
    externalTxnId: 'txn_001',
    accountId: 'acc_checking',
    bookedAt: '2024-03-15T00:00:00Z',
    currency: 'USD',
    amountMinor: '-2500',       // -$25.00
    merchantName: 'Whole Foods',
    bookingStatus: 'booked',
  },
  {
    externalTxnId: 'txn_002',
    accountId: 'acc_checking',
    bookedAt: '2024-03-16T00:00:00Z',
    currency: 'USD',
    amountMinor: '150000',      // +$1,500.00 (incoming)
    description: 'Payroll deposit',
    bookingStatus: 'booked',
  },
]);
```

---

### upsertFx

```ts
client.upsertFx(fxTransactions: IngestFxUpsert[]): Promise<IngestResult>
```

Create or update foreign-exchange transactions that move money between two currencies. The `fromAmountMinor` is always negative (outflow) and `toAmountMinor` is always positive (inflow) — or vice versa depending on your account perspective. Both amounts must be in the minor units of their respective currencies.

```ts
const result = await client.upsertFx([
  {
    externalTxnId: 'fx_001',
    fromAccountId: 'acc_usd_checking',
    toAccountId: 'acc_eur_checking',
    fromAmountMinor: '-100000',   // -$1,000.00 USD
    fromCurrency: 'USD',
    toAmountMinor: '92000',       // +€920.00 EUR
    toCurrency: 'EUR',
    bookedAt: '2024-03-15T14:00:00Z',
    description: 'Wise transfer',
  },
]);
```

---

### upsertTransfers

```ts
client.upsertTransfers(transfers: IngestTransferUpsert[]): Promise<IngestResult>
```

Create or update internal transfers between two accounts in the same currency. Tallyroot will cancel out both legs so the transfer does not inflate income or expenses.

```ts
const result = await client.upsertTransfers([
  {
    externalTxnId: 'xfer_001',
    fromAccountId: 'acc_checking',
    toAccountId: 'acc_savings',
    amountMinor: '50000',         // $500.00
    currency: 'USD',
    bookedAt: '2024-03-15T09:00:00Z',
    description: 'Monthly savings transfer',
  },
]);
```

---

### pushBalanceSnapshots

```ts
client.pushBalanceSnapshots(snapshots: IngestBalanceSnapshot[]): Promise<{ upserted: number }>
```

Push point-in-time balance snapshots for reconciliation. Tallyroot uses these to verify that the running balance derived from transactions matches your bank's reported balance.

```ts
const result = await client.pushBalanceSnapshots([
  {
    accountId: 'acc_checking',
    currency: 'USD',
    balanceMinor: '254370',       // $2,543.70
    snapshotAt: '2024-03-15T23:59:59Z',
  },
  {
    accountId: 'acc_savings',
    currency: 'USD',
    balanceMinor: '1500000',      // $15,000.00
    snapshotAt: '2024-03-15T23:59:59Z',
  },
]);

console.log(result.upserted); // 2
```

---

### sendAlert

```ts
client.sendAlert(opts: { error: string; consecutiveFailures: number }): Promise<void>
```

Send a connector health alert to Tallyroot. Call this when your connector encounters an unrecoverable error so that the workspace owner is notified. `consecutiveFailures` lets Tallyroot gauge the severity.

```ts
await client.sendAlert({
  error: 'Bank API returned 503 Service Unavailable',
  consecutiveFailures: 5,
});
```

---

### IngestResult

Returned by `upsertTransactions`, `upsertFx`, and `upsertTransfers`.

| Field | Type | Description |
|-------|------|-------------|
| `created` | `number` | New records that were inserted. |
| `skipped` | `number` | Records that were identical to an existing record and required no change. |
| `restated` | `number` | Records that existed but had at least one changed field and were updated. |

---

## Types

### IngestTransactionUpsert

```ts
interface IngestTransactionUpsert {
  externalTxnId: string;               // Your stable, unique transaction ID
  accountId: string;                   // Tallyroot account identifier
  bookedAt: string;                    // ISO 8601 datetime (e.g. "2024-03-15T10:30:00Z")
  currency: string;                    // ISO 4217 currency code (e.g. "USD", "EUR")
  amountMinor: string;                 // Amount in minor units as a string (negative = debit)
  baseAmountMinor?: string | null;     // Amount in base/home currency minor units (optional)
  merchantName?: string | null;        // Merchant display name
  description?: string | null;         // Raw description from the bank
  bookingStatus?: 'pending' | 'booked' | 'voided';  // Defaults to 'booked' if omitted
  raw?: Record<string, unknown> | null; // Arbitrary raw payload for debugging
}
```

**Amount conventions:**
- Debits (money leaving the account) are **negative**: `"-4550"` for -$45.50
- Credits (money entering the account) are **positive**: `"150000"` for +$1,500.00
- All amounts are strings, never JavaScript numbers, to avoid floating-point precision loss

---

### IngestFxUpsert

```ts
interface IngestFxUpsert {
  externalTxnId: string;
  fromAccountId: string;
  toAccountId: string;
  fromAmountMinor: string;             // Amount leaving fromAccount (typically negative)
  fromCurrency: string;
  toAmountMinor: string;               // Amount arriving in toAccount (typically positive)
  toCurrency: string;
  bookedAt: string;                    // ISO 8601 datetime
  baseFromAmountMinor?: string | null; // fromAmount in base/home currency
  baseToAmountMinor?: string | null;   // toAmount in base/home currency
  description?: string | null;
  raw?: Record<string, unknown> | null;
}
```

---

### IngestTransferUpsert

```ts
interface IngestTransferUpsert {
  externalTxnId: string;
  fromAccountId: string;
  toAccountId: string;
  amountMinor: string;                 // Positive value representing the transferred amount
  currency: string;
  bookedAt: string;                    // ISO 8601 datetime
  description?: string | null;
  raw?: Record<string, unknown> | null;
}
```

---

### IngestBalanceSnapshot

```ts
interface IngestBalanceSnapshot {
  accountId: string;
  currency: string;
  balanceMinor: string;                // Current account balance in minor units
  snapshotAt: string;                  // ISO 8601 datetime of the balance observation
}
```

---

## TallyrootApiError

All API failures throw a `TallyrootApiError`. It extends the standard `Error` class and adds structured fields.

```ts
import { TallyrootApiError } from '@tallyroot/sdk';

try {
  await client.upsertTransactions([...]);
} catch (err) {
  if (err instanceof TallyrootApiError) {
    console.log(err.status);      // HTTP status code, e.g. 429
    console.log(err.code);        // Machine-readable code, e.g. "RATE_LIMITED"
    console.log(err.retryAfter);  // Seconds to wait before retrying, or null
    console.log(err.message);     // Human-readable message from the API
  }
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | `number` | HTTP status code from the API response. |
| `code` | `string \| null` | Machine-readable error code. `null` for unexpected errors. |
| `retryAfter` | `number \| null` | Seconds to wait before retrying. Only set on 429 responses. |
| `message` | `string` | Human-readable description of the error. |

**Known error codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | The request payload failed schema validation. Check that all required fields are present and that amounts are valid strings. |
| `PLAN_REQUIRED` | 403 | The workspace's current plan does not include API access. Upgrade is required. |
| `RATE_LIMITED` | 429 | The request rate limit has been exceeded. Check `retryAfter` for when to retry. |

---

## Error Handling

### Rate limit retry pattern

The API enforces a rate limit of 120 requests per minute. When the limit is exceeded the server returns HTTP 429 with a `Retry-After` header. The SDK surfaces this as `TallyrootApiError` with `code === 'RATE_LIMITED'` and a populated `retryAfter` field.

```ts
import { TallyrootApiError } from '@tallyroot/sdk';

async function upsertWithRetry(
  transactions: IngestTransactionUpsert[],
  maxAttempts = 4,
): Promise<IngestResult> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await client.upsertTransactions(transactions);
    } catch (err) {
      if (
        err instanceof TallyrootApiError &&
        err.code === 'RATE_LIMITED' &&
        attempt < maxAttempts
      ) {
        const waitMs = (err.retryAfter ?? 60) * 1000;
        console.warn(`Rate limited. Retrying in ${waitMs / 1000}s…`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Exhausted retry attempts');
}
```

### Plan error handling

If your workspace does not have an active plan that includes API access, every request returns 403 `PLAN_REQUIRED`. Detect this early and surface it clearly rather than retrying.

```ts
try {
  await client.upsertTransactions([...]);
} catch (err) {
  if (err instanceof TallyrootApiError && err.code === 'PLAN_REQUIRED') {
    throw new Error(
      'Tallyroot API access requires a paid plan. ' +
      'Visit https://app.tallyroot.com/settings/billing to upgrade.',
    );
  }
  throw err;
}
```

### Validation errors

When the API returns `VALIDATION_ERROR`, the `message` field contains details about which fields failed. Log the full error to aid debugging:

```ts
try {
  await client.upsertTransactions(transactions);
} catch (err) {
  if (err instanceof TallyrootApiError && err.code === 'VALIDATION_ERROR') {
    console.error('Payload rejected by API:', err.message);
    // Fix the payload before retrying — validation errors will not resolve on their own
  }
  throw err;
}
```

---

## Money Helpers

All amount fields in the API use **minor units as strings** (e.g. cents for USD, pence for GBP). The helpers let you convert between human-readable decimal amounts and minor-unit strings without ever passing through a JavaScript `number`, which avoids floating-point rounding errors.

### toMinor

```ts
toMinor(amount: string, decimals: number): string
```

Convert a decimal amount string to minor units.

```ts
import { toMinor } from '@tallyroot/sdk';

toMinor('45.50', 2)    // → "4550"    ($45.50 → 4550 cents)
toMinor('-45.50', 2)   // → "-4550"   (debit)
toMinor('1500', 2)     // → "150000"  ($1,500.00)
toMinor('0.99', 2)     // → "99"
toMinor('10', 0)       // → "10"      (zero-decimal currency, e.g. JPY)
toMinor('1.005', 2)    // → "100"     (truncates, does not round)
```

### formatMinor

```ts
formatMinor(minor: string, decimals: number): string
```

Convert minor units back to a decimal string. Useful for logging and display.

```ts
import { formatMinor } from '@tallyroot/sdk';

formatMinor('4550', 2)    // → "45.50"
formatMinor('-4550', 2)   // → "-45.50"
formatMinor('150000', 2)  // → "1500.00"
formatMinor('99', 2)      // → "0.99"
formatMinor('10', 0)      // → "10"
```

### negateMinor

```ts
negateMinor(minor: string): string
```

Flip the sign of a minor-unit string. Useful when a source reports all amounts as positive and you need to negate debits.

```ts
import { negateMinor } from '@tallyroot/sdk';

negateMinor('4550')   // → "-4550"
negateMinor('-4550')  // → "4550"
negateMinor('0')      // → "0"
```

---

## Rate Limits

The Tallyroot API allows **120 requests per minute** per API key. Requests that exceed the limit receive an HTTP 429 response.

**Response headers on every request:**

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in the current window (120). |
| `X-RateLimit-Remaining` | Requests remaining in the current window. |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the window resets. |
| `Retry-After` | Present on 429 responses only. Seconds to wait before retrying. |

**Tips for staying within limits:**

- **Batch aggressively.** Each of the upsert methods accepts an array. A single call with 500 transactions counts as one request, not 500.
- **Respect `Retry-After`.** The SDK surfaces this as `TallyrootApiError.retryAfter`. Use it directly rather than guessing a back-off interval.
- **Avoid polling.** Push transactions as events happen (or in scheduled batch jobs) rather than repeatedly checking and re-syncing the same window.
- **Use a single source per connector.** The `source` field is for traceability, not for splitting traffic — all keys share the same per-workspace limit.

---

## Use-Case Guides

### Building a bank connector

A bank connector fetches new transactions from a bank API and pushes them to Tallyroot on a schedule (e.g. every 15 minutes). The key patterns are: fetch incrementally, convert amounts to minor units, deduplicate via `externalTxnId`, and push balance snapshots for reconciliation.

```ts
import { TallyrootClient, toMinor, TallyrootApiError } from '@tallyroot/sdk';

const client = new TallyrootClient({
  apiKey: process.env.TALLYROOT_API_KEY!,
  source: 'my-bank-connector',
});

async function sync(accountId: string) {
  let consecutiveFailures = 0;

  try {
    // 1. Fetch raw transactions from your bank API
    const bankTxns = await fetchFromBank({ since: lastSyncedAt() });

    // 2. Map to Tallyroot format
    const transactions = bankTxns.map((t) => ({
      externalTxnId: t.id,
      accountId,
      bookedAt: t.date,
      currency: t.currency,
      // Bank reports debit as positive — negate it
      amountMinor: t.type === 'debit'
        ? negateMinor(toMinor(t.amount, 2))
        : toMinor(t.amount, 2),
      merchantName: t.merchant ?? null,
      description: t.description,
      bookingStatus: t.pending ? 'pending' : 'booked',
      raw: t,
    }));

    // 3. Push in batches of 200 to stay well within rate limits
    for (let i = 0; i < transactions.length; i += 200) {
      const batch = transactions.slice(i, i + 200);
      const result = await client.upsertTransactions(batch);
      console.log(`Batch ${i / 200 + 1}: ${JSON.stringify(result)}`);
    }

    // 4. Push balance snapshot
    const balance = await fetchBalanceFromBank();
    await client.pushBalanceSnapshots([{
      accountId,
      currency: 'USD',
      balanceMinor: toMinor(balance.available, 2),
      snapshotAt: new Date().toISOString(),
    }]);

    consecutiveFailures = 0;
    saveLastSyncedAt(new Date().toISOString());
  } catch (err) {
    consecutiveFailures++;
    await client.sendAlert({
      error: err instanceof Error ? err.message : String(err),
      consecutiveFailures,
    });
    throw err;
  }
}
```

---

### Syncing from a CSV

CSV exports from banks often contain decimal amounts and inconsistent date formats. Use `toMinor` for amounts and normalise dates to ISO 8601 before pushing.

```ts
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { TallyrootClient, toMinor } from '@tallyroot/sdk';

const client = new TallyrootClient({
  apiKey: process.env.TALLYROOT_API_KEY!,
  source: 'csv-import',
});

// Example CSV row: date,description,amount,balance
// "03/15/2024","Corner Coffee","-4.50","1234.56"

function parseDate(raw: string): string {
  // Convert MM/DD/YYYY to ISO 8601
  const [month, day, year] = raw.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`;
}

async function importCsv(filePath: string, accountId: string) {
  const content = readFileSync(filePath, 'utf8');
  const rows = parse(content, { columns: true, skip_empty_lines: true }) as Array<{
    date: string;
    description: string;
    amount: string;
    balance: string;
  }>;

  const transactions = rows.map((row, index) => ({
    // Stable ID: combine file name + row index (or use a hash of date+description+amount)
    externalTxnId: `csv-${filePath}-${index}`,
    accountId,
    bookedAt: parseDate(row.date),
    currency: 'USD',
    amountMinor: toMinor(row.amount, 2),
    description: row.description,
    bookingStatus: 'booked' as const,
  }));

  const result = await client.upsertTransactions(transactions);
  console.log(`Import complete: ${JSON.stringify(result)}`);

  // Push the final balance from the last row
  const lastRow = rows.at(-1)!;
  await client.pushBalanceSnapshots([{
    accountId,
    currency: 'USD',
    balanceMinor: toMinor(lastRow.balance, 2),
    snapshotAt: new Date().toISOString(),
  }]);
}
```

---

### Handling the pending / booked / voided lifecycle

Bank transactions move through three states: **pending** (authorised but not yet settled), **booked** (settled), and **voided** (reversed or cancelled). Tallyroot tracks these transitions via the `bookingStatus` field and the stable `externalTxnId`.

```
pending ──→ booked   (transaction settled normally)
pending ──→ voided   (transaction was reversed or declined)
```

The critical rule: **always use the same `externalTxnId` for all states of a transaction**. Tallyroot uses this ID to match the pending record and update it in place.

```ts
// Day 1 — transaction appears as pending
await client.upsertTransactions([
  {
    externalTxnId: 'txn_abc123',
    accountId: 'acc_checking',
    bookedAt: '2024-03-14T18:00:00Z',
    currency: 'USD',
    amountMinor: '-4550',
    merchantName: 'Corner Coffee Shop',
    bookingStatus: 'pending',
  },
]);

// Day 3 — transaction has settled
await client.upsertTransactions([
  {
    externalTxnId: 'txn_abc123',      // Same ID — Tallyroot updates the existing record
    accountId: 'acc_checking',
    bookedAt: '2024-03-16T09:00:00Z', // Settlement date replaces the authorisation date
    currency: 'USD',
    amountMinor: '-4550',
    merchantName: 'Corner Coffee Shop',
    bookingStatus: 'booked',           // Status updated to booked
  },
]);

// Alternative Day 3 — transaction was reversed
await client.upsertTransactions([
  {
    externalTxnId: 'txn_abc123',
    accountId: 'acc_checking',
    bookedAt: '2024-03-14T18:00:00Z',
    currency: 'USD',
    amountMinor: '-4550',
    merchantName: 'Corner Coffee Shop',
    bookingStatus: 'voided',           // Tallyroot removes this from the ledger
  },
]);
```

**ID stability across bank API pagination:**

Some bank APIs assign different IDs to the pending and booked versions of a transaction. In that case, maintain a local mapping from the bank's pending ID to the booked ID and always translate back to the ID you originally used.

```ts
// Store mapping when you first see the pending transaction
const pendingToBookedId = new Map<string, string>();

function getStableId(bankTxn: BankTransaction): string {
  if (bankTxn.status === 'booked' && bankTxn.pendingId) {
    // Return the original pending ID so Tallyroot can match the record
    return pendingToBookedId.get(bankTxn.pendingId) ?? bankTxn.id;
  }
  if (bankTxn.status === 'pending') {
    pendingToBookedId.set(bankTxn.id, bankTxn.id);
  }
  return bankTxn.id;
}
```

---

## License

MIT — see [LICENSE](./LICENSE).
