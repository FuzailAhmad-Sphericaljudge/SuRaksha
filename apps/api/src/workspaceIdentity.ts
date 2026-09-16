import {
  authenticatedUserSchema,
  type AuthenticatedUser,
} from '@suraksha/contracts';

type HeaderValue = string | string[] | undefined;
type IdentityHeaders = Record<string, HeaderValue>;

function scalar(value: HeaderValue): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function readWorkspaceIdentity(
  headers: IdentityHeaders,
): AuthenticatedUser | null {
  const id = scalar(headers['oai-authenticated-user-id']);
  const email = scalar(headers['oai-authenticated-user-email']);
  if (!id && !email) return null;
  if (!id || !email) return null;
  const encodedName = scalar(headers['oai-authenticated-user-full-name']);
  const encoding = scalar(headers['oai-authenticated-user-full-name-encoding']);
  let displayName = email;
  if (encodedName && encoding === 'percent-encoded-utf-8') {
    try {
      const decoded = decodeURIComponent(encodedName).trim();
      if (decoded.length > 0 && decoded.length <= 100) displayName = decoded;
    } catch {
      // Malformed optional display data falls back to the trusted email.
    }
  }
  const result = authenticatedUserSchema.safeParse({ id, email, displayName });
  return result.success ? result.data : null;
}
