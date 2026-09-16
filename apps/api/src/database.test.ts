import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, PropertyCandidateRepository } from './database.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('database persistence and isolation', () => {
  it('persists records after closing and reopening', () => {
    const directory = mkdtempSync(join(tmpdir(), 'suraksha-db-'));
    directories.push(directory);
    const path = join(directory, 'demo.sqlite');
    const first = openDatabase(path);
    new PropertyCandidateRepository(first).save({
      id: 'candidate-1',
      name: 'Student Home',
      locality: 'Kota',
      source: 'owner_submission',
      createdAt: '2026-09-16T10:00:00.000Z',
    });
    first.close();
    const reopened = openDatabase(path);
    expect(new PropertyCandidateRepository(reopened).list()).toHaveLength(1);
    reopened.close();
  });
  it('keeps demo and production files isolated', () => {
    const directory = mkdtempSync(join(tmpdir(), 'suraksha-db-'));
    directories.push(directory);
    const demo = openDatabase(join(directory, 'demo.sqlite'));
    const production = openDatabase(join(directory, 'production.sqlite'));
    new PropertyCandidateRepository(demo).save({
      id: 'demo-1',
      name: 'Fictional PG',
      locality: 'Sample Nagar',
      source: 'demo_seed',
      createdAt: '2026-09-16T10:00:00.000Z',
    });
    expect(new PropertyCandidateRepository(production).list()).toEqual([]);
    demo.close();
    production.close();
  });
});
