import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import AjvModule, { type AnySchemaObject } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

// Both packages are CommonJS. Importing one from ESM binds the whole
// module.exports object, so the class and the plugin sit under `.default`.
const Ajv = AjvModule.default;
const addFormats = addFormatsModule.default;

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../schemas');

export const DOCUMENT_KINDS = [
  'verdict',
  'evidence',
  'outcome',
  'score',
  'module',
  'rate-report',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export class ValidationError extends Error {
  constructor(
    readonly kind: DocumentKind,
    readonly problems: string[],
  ) {
    super(`Invalid ${kind}:\n  ${problems.join('\n  ')}`);
    this.name = 'ValidationError';
  }
}

// allErrors: a document with three problems should report three, not send the
// author round the loop three times.
const ajv = addFormats(new Ajv({ allErrors: true, strict: true }));

for (const kind of DOCUMENT_KINDS) {
  const schema = JSON.parse(
    readFileSync(join(SCHEMA_DIR, `${kind}.schema.json`), 'utf8'),
  ) as AnySchemaObject;
  ajv.addSchema(schema, kind);
}

/**
 * Validates a parsed document against its schema.
 *
 * Throws rather than returning a result. Validation failure is fatal by design:
 * an unmeasurable verdict must be impossible to store, and a caller that can
 * ignore a boolean will eventually ignore it.
 */
export function assertValid(kind: DocumentKind, data: unknown): void {
  const validate = ajv.getSchema(kind);
  /* v8 ignore next 3 -- unreachable: every kind is registered above */
  if (!validate) {
    throw new Error(`No schema registered for ${kind}`);
  }

  if (!validate(data)) {
    const problems = (validate.errors ?? []).map(
      (error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
    );
    throw new ValidationError(kind, problems);
  }
}
