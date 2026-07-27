import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ResolutionSource } from '../schema/types.js';
import { assertValid } from '../schema/validate.js';

/**
 * `empty` means nothing is configured yet and the tab says so.
 * `incomplete` means someone started and stopped at one seer — which is worse
 * than empty, because a single seer produces numbers that look like a track
 * record while having nothing to be wrong against.
 */
export type ModuleStatus = 'configured' | 'incomplete' | 'empty';

export interface AssetModule {
  id: string;
  name: string;
  /** Shown in the interface, which is Turkish. */
  label_tr: string;
  /** Position in the tab strip. */
  order: number;
  horizon_days: { min: number; max: number };
  sources: ResolutionSource[];
  seers: string[];
  status?: ModuleStatus;
}

const REQUIRED_SEERS = 2;

function statusOf(seers: string[]): ModuleStatus {
  if (seers.length === 0) return 'empty';
  return seers.length < REQUIRED_SEERS ? 'incomplete' : 'configured';
}

/**
 * Reads every asset class module under a root.
 *
 * Discovery is by folder, so adding a class means adding a folder and a
 * definition file — there is no central list that a new module can be missing
 * from while appearing to exist.
 */
export function loadModules(root: string): Required<AssetModule>[] {
  if (!existsSync(root)) return [];

  const folders = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : 1));

  const modules = folders.map((folder) => {
    const path = join(root, folder, 'module.json');
    const data: unknown = JSON.parse(readFileSync(path, 'utf8'));

    try {
      assertValid('module', data);
    } catch (error) {
      throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }

    const module = data as AssetModule;
    if (module.id !== folder) {
      throw new Error(`${path}: id "${module.id}" does not match its folder "${folder}"`);
    }

    return { ...module, status: statusOf(module.seers) };
  });

  // Read in a stable order, returned in the intended one. Sorting by folder name
  // would order the tabs by English identifier, which puts Hisse before Döviz
  // and means nothing to the person reading them.
  return modules.sort((a, b) => a.order - b.order);
}
