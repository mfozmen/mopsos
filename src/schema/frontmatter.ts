import { parse } from 'yaml';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export interface Document {
  /** The YAML frontmatter, parsed. Validated against a schema by the caller. */
  data: unknown;
  /** Everything after the closing delimiter — the seer's reasoning, or a note. */
  body: string;
}

/**
 * Splits a Markdown file into its frontmatter and its body.
 *
 * Deliberately strict: a file without frontmatter throws rather than yielding an
 * empty object. An empty object would validate as "missing every required field"
 * and produce a confusing schema error, when the real problem is a malformed file.
 */
export function parseFrontmatter(source: string): Document {
  const match = FRONTMATTER.exec(source);
  if (!match) {
    throw new Error('No YAML frontmatter found: expected the file to start with a --- block');
  }

  const [, yaml = '', body = ''] = match;
  const data: unknown = parse(yaml);
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Frontmatter must be a YAML mapping');
  }

  return { data, body: body.trim() };
}
