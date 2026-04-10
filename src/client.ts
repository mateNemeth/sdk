import type {
  IngestTransactionUpsert,
  IngestFxUpsert,
  IngestTransferUpsert,
  IngestBalanceSnapshot,
  IngestResult,
} from './types.js';
import { parseApiError } from './error.js';

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

  /** Upsert transactions (create or update by externalTxnId). */
  async upsertTransactions(transactions: IngestTransactionUpsert[]): Promise<IngestResult> {
    return this.request<IngestResult>('/api/v1/ingest/transactions', 'PUT', {
      source: this.source,
      transactions,
    });
  }

  /** Upsert foreign-exchange transactions. */
  async upsertFx(fxTransactions: IngestFxUpsert[]): Promise<IngestResult> {
    return this.request<IngestResult>('/api/v1/ingest/fx', 'PUT', {
      source: this.source,
      fxTransactions,
    });
  }

  /** Upsert internal transfers between accounts. */
  async upsertTransfers(transfers: IngestTransferUpsert[]): Promise<IngestResult> {
    return this.request<IngestResult>('/api/v1/ingest/transfers', 'PUT', {
      source: this.source,
      transfers,
    });
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
    return this.request<{ upserted: number }>('/api/v1/ingest/balance-snapshots', 'POST', {
      snapshots,
    });
  }
}
