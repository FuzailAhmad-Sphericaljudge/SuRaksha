import { describe, expect, it } from 'vitest';
import { readWorkspaceIdentity } from './workspaceIdentity.js';

describe('workspace identity headers', () => {
  it('returns anonymous for absent or incomplete identity', () => {
    expect(readWorkspaceIdentity({})).toBeNull();
    expect(
      readWorkspaceIdentity({ 'oai-authenticated-user-id': 'u1' }),
    ).toBeNull();
    expect(
      readWorkspaceIdentity({
        'oai-authenticated-user-email': 'student@example.test',
      }),
    ).toBeNull();
    expect(
      readWorkspaceIdentity({
        'oai-authenticated-user-id': ['u1'],
        'oai-authenticated-user-email': 'student@example.test',
      }),
    ).toBeNull();
  });

  it('uses email fallback and decodes only the documented optional name header', () => {
    expect(
      readWorkspaceIdentity({
        'oai-authenticated-user-id': 'u1',
        'oai-authenticated-user-email': 'student@example.test',
      }),
    ).toEqual({
      id: 'u1',
      email: 'student@example.test',
      displayName: 'student@example.test',
    });
    expect(
      readWorkspaceIdentity({
        'oai-authenticated-user-id': 'u1',
        'oai-authenticated-user-email': 'student@example.test',
        'oai-authenticated-user-full-name': 'Asha%20Kumar',
        'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
      }),
    ).toMatchObject({ displayName: 'Asha Kumar' });
    expect(
      readWorkspaceIdentity({
        'oai-authenticated-user-id': 'u1',
        'oai-authenticated-user-email': 'student@example.test',
        'oai-authenticated-user-full-name': '%E0%A4%A',
        'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
      }),
    ).toMatchObject({ displayName: 'student@example.test' });
  });

  it('does not accept invalid email or unrecognized encoding as identity', () => {
    expect(
      readWorkspaceIdentity({
        'oai-authenticated-user-id': 'u1',
        'oai-authenticated-user-email': 'not-an-email',
      }),
    ).toBeNull();
    expect(
      readWorkspaceIdentity({
        'oai-authenticated-user-id': 'u1',
        'oai-authenticated-user-email': 'student@example.test',
        'oai-authenticated-user-full-name': 'Asha%20Kumar',
        'oai-authenticated-user-full-name-encoding': 'utf8',
      }),
    ).toMatchObject({ displayName: 'student@example.test' });
  });
});
