// Ingest DTOs — all amount fields are strings (bigint wire format)

export interface IngestTransactionUpsert {
  externalTxnId: string;
  accountId: string;
  bookedAt: string; // ISO 8601
  currency: string;
  amountMinor: string;
  baseAmountMinor?: string | null;
  merchantName?: string | null;
  description?: string | null;
  bookingStatus?: 'pending' | 'booked' | 'voided';
  raw?: Record<string, unknown> | null;
}

export interface IngestFxUpsert {
  externalTxnId: string;
  fromAccountId: string;
  toAccountId: string;
  fromAmountMinor: string;
  fromCurrency: string;
  toAmountMinor: string;
  toCurrency: string;
  bookedAt: string; // ISO 8601
  baseFromAmountMinor?: string | null;
  baseToAmountMinor?: string | null;
  description?: string | null;
  raw?: Record<string, unknown> | null;
}

export interface IngestTransferUpsert {
  externalTxnId: string;
  fromAccountId: string;
  toAccountId: string;
  amountMinor: string;
  currency: string;
  bookedAt: string; // ISO 8601
  description?: string | null;
  raw?: Record<string, unknown> | null;
}

export interface IngestBalanceSnapshot {
  accountId: string;
  currency: string;
  balanceMinor: string;
  snapshotAt: string; // ISO 8601
}

export interface IngestResult {
  created: number;
  skipped: number;
  restated: number;
}
