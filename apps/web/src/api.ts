import { healthResponseSchema, type HealthResponse } from '@suraksha/contracts';

export async function fetchHealth(
  signal: AbortSignal,
): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Service unavailable.');
  return healthResponseSchema.parse(await response.json());
}
