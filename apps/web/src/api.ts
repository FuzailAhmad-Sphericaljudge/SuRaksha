import {
  bootstrapResponseSchema,
  healthResponseSchema,
  type BootstrapResponse,
  type HealthResponse,
} from '@suraksha/contracts';

export async function fetchBootstrap(
  signal: AbortSignal,
): Promise<BootstrapResponse> {
  const response = await fetch('/api/bootstrap', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Environment unavailable.');
  return bootstrapResponseSchema.parse(await response.json());
}

export async function fetchHealth(
  signal: AbortSignal,
): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Service unavailable.');
  return healthResponseSchema.parse(await response.json());
}
