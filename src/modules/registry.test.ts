import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadModules, type AssetModule } from './registry.js';

const MODULES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../modules');

function definition(overrides: Partial<AssetModule> = {}): AssetModule {
  return {
    id: 'housing',
    name: 'Housing & Mortgage',
    label_tr: 'Konut',
    order: 0,
    horizon_days: { min: 180, max: 730 },
    sources: ['evds', 'tuik', 'listing_snapshot'],
    seers: ['cautious', 'contrarian'],
    ...overrides,
  };
}

function write(root: string, id: string, module: unknown): void {
  mkdirSync(join(root, id), { recursive: true });
  writeFileSync(join(root, id, 'module.json'), JSON.stringify(module), 'utf8');
}

function temp(): string {
  return mkdtempSync(join(tmpdir(), 'mopsos-modules-'));
}

describe('discovery', () => {
  it('finds a module from its folder, with no central list to edit', () => {
    const root = temp();
    write(root, 'housing', definition());

    expect(loadModules(root).map((module) => module.id)).toEqual(['housing']);
  });

  it('finds modules added later without any other file changing', () => {
    const root = temp();
    write(root, 'housing', definition());
    write(root, 'fx', definition({ id: 'fx', name: 'FX', seers: [] }));

    expect(loadModules(root).map((module) => module.id)).toEqual(['fx', 'housing']);
  });

  it('accepts a class nobody has thought of yet, with no other file edited', () => {
    // The whole claim is that a new asset class is a folder and a file. A closed
    // list of ids anywhere would quietly make that false.
    const root = temp();
    write(root, 'crypto', definition({ id: 'crypto', name: 'Crypto', seers: [] }));

    expect(loadModules(root).map((module) => module.id)).toEqual(['crypto']);
  });

  it('refuses a definition whose id disagrees with its folder', () => {
    const root = temp();
    write(root, 'housing', definition({ id: 'equities' }));

    expect(() => loadModules(root)).toThrow(/folder/i);
  });

  it('refuses a malformed definition rather than skipping the module', () => {
    const root = temp();
    write(root, 'housing', { id: 'housing' });

    expect(() => loadModules(root)).toThrow(/housing/);
  });
});

describe('completeness', () => {
  it('reports a module with two seers as configured', () => {
    const root = temp();
    write(root, 'housing', definition());

    expect(loadModules(root)[0]?.status).toBe('configured');
  });

  it('reports a module with no seers as empty', () => {
    const root = temp();
    write(root, 'fx', definition({ id: 'fx', seers: [] }));

    expect(loadModules(root)[0]?.status).toBe('empty');
  });

  it('reports a single-seer module as incomplete rather than accepting it', () => {
    // One seer has no one to be wrong against, so its record means nothing.
    const root = temp();
    write(root, 'fx', definition({ id: 'fx', seers: ['cautious'] }));

    expect(loadModules(root)[0]?.status).toBe('incomplete');
  });
});

describe('the modules committed to this repository', () => {
  it('returns the committed modules in the order the interface shows them', () => {
    // Not alphabetical: sorting by folder name puts Hisse before Döviz, which
    // is an ordering of English identifiers and means nothing to the reader.
    expect(loadModules(MODULES_DIR).map((module) => module.label_tr)).toEqual([
      'Konut',
      'Altın & Gümüş',
      'Döviz',
      'Hisse',
      'Fonlar',
    ]);
  });

  it('carries a Turkish label for every module, since the interface is Turkish', () => {
    // Kept in the module file rather than a map in the UI: a map would be one
    // more central edit, and adding a class is meant to be adding a folder.
    for (const module of loadModules(MODULES_DIR)) {
      expect(module.label_tr).toBeTruthy();
    }
  });

  it('has no configured module yet, since no seer exists anywhere', () => {
    // Housing is the priority class but its seers are #25 and #26. Until then it
    // is as empty as the other three, and the registry says so rather than
    // treating "the important one" as a special case.
    const status = Object.fromEntries(
      loadModules(MODULES_DIR).map((module) => [module.id, module.status]),
    );

    expect(status).toEqual({
      equities: 'empty',
      funds: 'empty',
      fx: 'empty',
      housing: 'empty',
      precious_metals: 'empty',
    });
  });
});
