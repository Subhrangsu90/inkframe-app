import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiRequestError, getJson } from './api-response';

const Methods = z.object({ emailPassword: z.boolean(), google: z.boolean() });

const respond = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

describe('getJson', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the answer's checked data", async () => {
    respond(200, {
      success: true,
      message: 'Sign-in methods',
      data: { emailPassword: true, google: false, extra: 'dropped' },
    });
    expect(await getJson('http://api.test/v1/auth/methods', Methods)).toEqual({
      emailPassword: true,
      google: false,
    });
  });

  it('gives up on a stalled request instead of waiting forever', async () => {
    respond(200, { success: true, message: 'ok', data: { emailPassword: true, google: true } });
    await getJson('http://api.test/v1/auth/methods', Methods);
    const init = vi.mocked(fetch).mock.calls[0][1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.signal?.aborted).toBe(false);
  });

  it("turns the server's refusal into an ApiRequestError with its code", async () => {
    respond(429, { success: false, code: 'rate_limited', message: 'Too many requests.' });
    await expect(getJson('http://api.test/v1/x', Methods)).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 429,
      code: 'rate_limited',
      message: 'Too many requests.',
    });
  });

  it('refuses answers of the wrong shape instead of passing them on', async () => {
    respond(200, { success: true, message: 'ok', data: { google: 'yes' } });
    const error = await getJson('http://api.test/v1/x', Methods).catch((e) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error.code).toBe('unexpected_response');

    respond(502, '<html>Bad gateway</html>');
    await expect(getJson('http://api.test/v1/x', Methods)).rejects.toMatchObject({
      status: 502,
      code: 'unexpected_response',
    });
  });

  it('lets a network failure through as it is', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(getJson('http://api.test/v1/x', Methods)).rejects.toBeInstanceOf(TypeError);
  });
});
