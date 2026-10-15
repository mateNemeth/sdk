import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { TallyrootClient, TallyrootApiError } from '../dist/index.js';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/**
 * Replaces `fetch` with a mock that records each request body and answers
 * with `respond(body, callIndex)`. It throws if a request starts while
 * another is still in flight, so a passing test also proves the SDK sends
 * chunks one at a time.
 */
function mockFetch(respond) {
  const calls = [];
  let inFlight = 0;
  globalThis.fetch = async (url, init) => {
    if (inFlight > 0) throw new Error('request started while another was in flight');
    inFlight++;
    try {
      const body = JSON.parse(init.body);
      calls.push({ url, method: init.method, body });
      await new Promise((resolve) => setTimeout(resolve, 1));
      const { status = 200, json } = respond(body, calls.length - 1);
      return new Response(JSON.stringify(json), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    } finally {
      inFlight--;
    }
  };
  return calls;
}

function makeClient() {
  return new TallyrootClient({ apiKey: 'bk_test', source: 'test', baseUrl: 'http://api.test' });
}

function makeTransactions(n) {
  return Array.from({ length: n }, (_, i) => ({
    externalTxnId: `txn_${i}`,
    accountId: 'acc_checking',
    bookedAt: '2026-10-15T00:00:00Z',
    currency: 'USD',
    amountMinor: '-100',
  }));
}

const okResult = (n) => ({ json: { created: n, skipped: 1, restated: 2, unresolvedFx: 3 } });

test('1201 transactions go out as 500, 500, and 201 in order, with one combined result', async () => {
  const calls = mockFetch((body) => okResult(body.transactions.length));

  const result = await makeClient().upsertTransactions(makeTransactions(1201));

  assert.deepEqual(
    calls.map((c) => c.body.transactions.length),
    [500, 500, 201],
  );
  assert.deepEqual(
    calls.map((c) => c.body.transactions[0].externalTxnId),
    ['txn_0', 'txn_500', 'txn_1000'],
  );
  assert.equal(calls[2].body.transactions.at(-1).externalTxnId, 'txn_1200');
  for (const c of calls) {
    assert.equal(c.url, 'http://api.test/api/v1/ingest/transactions');
    assert.equal(c.method, 'PUT');
    assert.equal(c.body.source, 'test');
  }
  assert.deepEqual(result, { created: 1201, skipped: 3, restated: 6, unresolvedFx: 9 });
});

test('exactly 500 transactions go out as one request', async () => {
  const calls = mockFetch((body) => okResult(body.transactions.length));

  const result = await makeClient().upsertTransactions(makeTransactions(500));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.transactions.length, 500);
  assert.deepEqual(result, { created: 500, skipped: 1, restated: 2, unresolvedFx: 3 });
});

test('an empty array still sends one request', async () => {
  const calls = mockFetch(() => ({ json: { created: 0, skipped: 0, restated: 0, unresolvedFx: 0 } }));

  const result = await makeClient().upsertTransactions([]);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.transactions, []);
  assert.deepEqual(result, { created: 0, skipped: 0, restated: 0, unresolvedFx: 0 });
});

test('a failure in the second chunk throws after the first chunk was sent', async () => {
  const calls = mockFetch((body, i) =>
    i === 1
      ? { status: 400, json: { error: 'Invalid request body', issues: [] } }
      : okResult(body.transactions.length),
  );

  await assert.rejects(makeClient().upsertTransactions(makeTransactions(1201)), (err) => {
    assert.ok(err instanceof TallyrootApiError);
    assert.equal(err.status, 400);
    assert.equal(err.code, 'VALIDATION_ERROR');
    return true;
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.transactions.length, 500);
});

test('upsertFx and upsertTransfers chunk under their own array keys', async () => {
  const calls = mockFetch((body) => okResult((body.fxTransactions ?? body.transfers).length));
  const client = makeClient();

  const fx = await client.upsertFx(makeTransactions(501));
  const transfers = await client.upsertTransfers(makeTransactions(1000));

  assert.deepEqual(
    calls.map((c) => [c.url.split('/').at(-1), (c.body.fxTransactions ?? c.body.transfers).length]),
    [['fx', 500], ['fx', 1], ['transfers', 500], ['transfers', 500]],
  );
  assert.equal(fx.created, 501);
  assert.equal(transfers.created, 1000);
});

test('pushBalanceSnapshots chunks and sums upserted', async () => {
  const calls = mockFetch((body) => ({ json: { upserted: body.snapshots.length } }));
  const snapshots = Array.from({ length: 750 }, (_, i) => ({
    accountId: 'acc_checking',
    currency: 'USD',
    balanceMinor: String(i),
    snapshotAt: '2026-10-15T00:00:00Z',
  }));

  const result = await makeClient().pushBalanceSnapshots(snapshots);

  assert.deepEqual(calls.map((c) => c.body.snapshots.length), [500, 250]);
  for (const c of calls) {
    assert.equal(c.method, 'POST');
    assert.equal(c.body.source, undefined);
  }
  assert.deepEqual(result, { upserted: 750 });
});
