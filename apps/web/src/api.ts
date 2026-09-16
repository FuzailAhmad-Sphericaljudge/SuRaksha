import {
  bootstrapResponseSchema,
  healthResponseSchema,
  type BootstrapResponse,
  type HealthResponse,
  sessionResponseSchema,
  type SessionResponse,
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

export async function fetchSession(
  signal?: AbortSignal,
): Promise<SessionResponse> {
  const response = await fetch('/api/session', {
    ...(signal ? { signal } : {}),
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('Session unavailable.');
  return sessionResponseSchema.parse(await response.json());
}

export async function registerDemoAccount(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<SessionResponse> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body?.error?.message ?? 'Registration failed.');
  return sessionResponseSchema.parse(body);
}

export async function loginDemoAccount(input: {
  email: string;
  password: string;
}): Promise<SessionResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? 'Sign in failed.');
  return sessionResponseSchema.parse(body);
}

export async function logoutDemoAccount() {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (!response.ok && response.status !== 204)
    throw new Error('Logout failed.');
}

export async function saveOnboarding(
  role: 'student' | 'parent_guardian' | 'owner_manager' | 'professional',
): Promise<SessionResponse> {
  const response = await fetch('/api/onboarding', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body?.error?.message ?? 'Onboarding failed.');
  return sessionResponseSchema.parse(body);
}
