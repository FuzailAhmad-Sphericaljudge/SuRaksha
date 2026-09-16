import { afterEach, expect, it, vi } from 'vitest';
import { fetchHealth } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('validates server data instead of trusting arbitrary JSON', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'safe' }))),
  );
  await expect(fetchHealth(new AbortController().signal)).rejects.toThrow();
});

it('handles failure and allows a user-initiated retry', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response('down', { status: 503 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          service: 'suraksha-api',
          status: 'ok',
          timestamp: '2026-09-16T10:30:00Z',
        }),
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  const signal = new AbortController().signal;
  await expect(fetchHealth(signal)).rejects.toThrow('Service unavailable');
  await expect(fetchHealth(signal)).resolves.toMatchObject({ status: 'ok' });
  expect(fetchMock).toHaveBeenLastCalledWith('/api/health', {
    signal,
    cache: 'no-store',
  });
});
