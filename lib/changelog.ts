/**
 * @file changelog.ts
 * @description Parses changelog.md for the What's new screen. Only version
 * headings ("## ") and their bullets ("- ") are kept; the file's title and
 * intro are for developers.
 */

export type Entry = { heading: string; bullets: string[] };

/**
 * Splits the changelog into one entry per "## " heading.
 * @param md - changelog.md contents
 * @returns Entries in file order (newest first)
 */
export function parseChangelog(md: string): Entry[] {
  const entries: Entry[] = [];
  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith('## ')) entries.push({ heading: line.slice(3).trim(), bullets: [] });
    else if (line.startsWith('- ') && entries.length) entries[entries.length - 1].bullets.push(line.slice(2).trim());
  }
  return entries;
}
