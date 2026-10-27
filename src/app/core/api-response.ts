import { z } from './zod';

/*
 * The shapes of inkframe-server's /v1 answers, checked with Zod before the
 * app uses them. Import this only from code that loads on demand: Zod stays
 * out of the first page load (the initial bundle budget is 150 kB).
 */

/** A successful /v1 answer: `{ success: true, message, data }`; each route checks `data` with its own schema. */
export const ApiSuccessBody = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.unknown(),
});

/** A failed /v1 answer: `{ success: false, code, message, details? }`. */
export const ApiErrorBody = z.object({
  success: z.literal(false),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

/**
 * A /v1 request the server refused (its `code` and `message`), or answered
 * in a shape the app doesn't understand (`code: 'unexpected_response'`).
 * Network failures stay fetch's own TypeError.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const unexpected = (status: number) =>
  new ApiRequestError(
    status,
    'unexpected_response',
    `Unexpected answer from the server (${status})`,
  );

/**
 * How long a request to the server may take before it is given up, so a
 * stalled connection fails like a dropped one instead of hanging.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/** GETs a /v1 route and returns its `data`, checked against `data`. */
export async function getJson<T extends z.ZodType>(
  url: string,
  data: T,
  init: RequestInit = {},
): Promise<z.output<T>> {
  const res = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const failure = ApiErrorBody.safeParse(body);
    if (!failure.success) throw unexpected(res.status);
    const { code, message, details } = failure.data;
    throw new ApiRequestError(res.status, code, message, details);
  }
  const envelope = ApiSuccessBody.safeParse(body);
  const parsed = envelope.success ? data.safeParse(envelope.data.data) : null;
  if (!parsed?.success) throw unexpected(res.status);
  return parsed.data;
}

/** POSTs `body` as JSON to a /v1 route and returns its `data`, checked against `data`. */
export function postJson<T extends z.ZodType>(
  url: string,
  body: unknown,
  data: T,
  init: RequestInit = {},
): Promise<z.output<T>> {
  return getJson(url, data, {
    ...init,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    body: JSON.stringify(body),
  });
}
