import type {
  IngestTransactionUpsert,
  IngestFxUpsert,
  IngestTransferUpsert,
  IngestBalanceSnapshot,
  IngestResult,
} from './types.js';
import { parseApiError } from './error.js';

/**
 * Most items the SDK sends in one ingest request. The server accepts at most
 * 1000 per array, so 500 leaves headroom.
 */
const INGEST_CHUNK_SIZE = 500;

/** Adds up the counts of per-chunk ingest results. */
function sumIngestResults(results: IngestResult[]): IngestResult {
  return results.reduce(
    (acc, r) => ({
      created: acc.created + r.created,
      skipped: acc.skipped + r.skipped,
      restated: acc.restated + r.restated,
      unresolvedFx: acc.unresolvedFx + r.unresolvedFx,
    }),
    { created: 0, skipped: 0, restated: 0, unresolvedFx: 0 },
  );
}

export interface TallyrootClientOptions {
  /** Workspace API key (starts with `bk_`). */
  apiKey: string;
  /** Source identifier included with every ingest call. */
  source: string;
  /** Base URL of the Tallyroot API. Defaults to `"https://app.tallyroot.com"`. */
  baseUrl?: string;
}

export class TallyrootClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly source: string;

  constructor(opts: TallyrootClientOptions) {
    this.baseUrl = (opts.baseUrl ?? 'https://app.tallyroot.com').replace(/\/+$/, '');
    this.apiKey = opts.apiKey;
    this.source = opts.source;
  }

  private async request<T>(path: string, method: 'PUT' | 'POST', body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw await parseApiError(res);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Sends `items` in chunks of at most INGEST_CHUNK_SIZE, one request at a
   * time, and returns each chunk's result in order. An empty array still sends
   * one request, as it did before chunking. If a chunk fails, the error
   * propagates and the earlier chunks stay applied.
   */
  private async sendInChunks<I, T>(items: I[], send: (chunk: I[]) => Promise<T>): Promise<T[]> {
    if (items.length === 0) return [await send(items)];
    const results: T[] = [];
    for (let start = 0; start < items.length; start += INGEST_CHUNK_SIZE) {
      results.push(await send(items.slice(start, start + INGEST_CHUNK_SIZE)));
    }
    return results;
  }

  /** Upsert transactions (create or update by externalTxnId). */
  async upsertTransactions(transactions: IngestTransactionUpsert[]): Promise<IngestResult> {
    const results = await this.sendInChunks(transactions, (chunk) =>
      this.request<IngestResult>('/api/v1/ingest/transactions', 'PUT', {
        source: this.source,
        transactions: chunk,
      }),
    );
    return sumIngestResults(results);
  }

  /** Upsert foreign-exchange transactions. */
  async upsertFx(fxTransactions: IngestFxUpsert[]): Promise<IngestResult> {
    const results = await this.sendInChunks(fxTransactions, (chunk) =>
      this.request<IngestResult>('/api/v1/ingest/fx', 'PUT', {
        source: this.source,
        fxTransactions: chunk,
      }),
    );
    return sumIngestResults(results);
  }

  /** Upsert internal transfers between accounts. */
  async upsertTransfers(transfers: IngestTransferUpsert[]): Promise<IngestResult> {
    const results = await this.sendInChunks(transfers, (chunk) =>
      this.request<IngestResult>('/api/v1/ingest/transfers', 'PUT', {
        source: this.source,
        transfers: chunk,
      }),
    );
    return sumIngestResults(results);
  }

  /** Send an alert (e.g. connector failure notification). */
  async sendAlert(opts: { error: string; consecutiveFailures: number }): Promise<void> {
    await this.request<{ ok: boolean }>('/api/v1/ingest/alert', 'POST', {
      source: this.source,
      error: opts.error,
      consecutiveFailures: opts.consecutiveFailures,
    });
  }

  /** Push balance snapshots for reconciliation. */
  async pushBalanceSnapshots(snapshots: IngestBalanceSnapshot[]): Promise<{ upserted: number }> {
    const results = await this.sendInChunks(snapshots, (chunk) =>
      this.request<{ upserted: number }>('/api/v1/ingest/balance-snapshots', 'POST', {
        snapshots: chunk,
      }),
    );
    return { upserted: results.reduce((sum, r) => sum + r.upserted, 0) };
  }
}
