import { byCodePoint } from '../order.js';
import type { Verdict } from '../schema/types.js';

export class UnknownAssetClassError extends Error {
  constructor(
    readonly assetClass: string,
    registered: string[],
  ) {
    super(
      `asset_class "${assetClass}" has no module. Registered: ${[...registered].sort(byCodePoint).join(', ')}`,
    );
    this.name = 'UnknownAssetClassError';
  }
}

/**
 * Checks a verdict's asset class against the modules that actually exist.
 *
 * This lives here rather than as an enum in the verdict schema on purpose. The
 * registry's whole claim is that adding an asset class means adding a folder and
 * a definition file; a closed list in the schema would quietly make that false,
 * since a new class would register as a module and then be rejected on every
 * verdict it produced.
 *
 * The check itself is worth keeping — a verdict citing a class that does not
 * exist is a real error, usually a typo. It just belongs where the answer lives.
 */
export function assertRegisteredAssetClass(verdict: Verdict, registered: string[]): void {
  if (!registered.includes(verdict.asset_class)) {
    throw new UnknownAssetClassError(verdict.asset_class, registered);
  }
}
