/**
 * Error thrown when the Tallyroot API returns a non-OK response.
 */
export class TallyrootApiError extends Error {
  /** HTTP status code */
  readonly status: number;

  /**
   * Machine-readable error code from the API response, or inferred from status.
   * Known values: "PLAN_REQUIRED" (403), "RATE_LIMITED" (429), "VALIDATION_ERROR" (400).
   */
  readonly code: string | null;

  /**
   * Seconds to wait before retrying (from 429 Retry-After header).
   * null for non-429 errors.
   */
  readonly retryAfter: number | null;

  constructor(opts: {
    message: string;
    status: number;
    code: string | null;
    retryAfter: number | null;
  }) {
    super(opts.message);
    this.name = 'TallyrootApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.retryAfter = opts.retryAfter;
  }
}

/**
 * Parse an API error response into a TallyrootApiError.
 * @internal
 */
export async function parseApiError(res: Response): Promise<TallyrootApiError> {
  let message = `API request failed (${res.status})`;
  let code: string | null = null;

  try {
    const body = await res.json() as { error?: string; code?: string };
    if (body.error) message = body.error;
    code = body.code ?? null;
  } catch {
    const text = await res.text().catch(() => '');
    if (text) message = text;
  }

  if (!code) {
    if (res.status === 400) code = 'VALIDATION_ERROR';
    else if (res.status === 429) code = 'RATE_LIMITED';
  }

  const retryAfterHeader = res.headers.get('retry-after');
  const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : null;

  return new TallyrootApiError({
    message,
    status: res.status,
    code,
    retryAfter: Number.isNaN(retryAfter) ? null : retryAfter,
  });
}
