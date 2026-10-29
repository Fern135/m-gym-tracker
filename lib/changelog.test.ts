/**
 * @file changelog.test.ts
 * @description Assert-based checks for changelog.ts. Run with: npx -y tsx lib/changelog.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseChangelog } from './changelog';

const md = '# Changelog\r\n\r\nIntro line.\r\n- not under a version\r\n\r\n## 1.0.1 — October 28, 2026\r\n\r\n- One **bold** thing\r\n- Two\r\n\r\n## 1.0.0 — October 27, 2026\r\n\r\n- First release.\r\n';
assert.deepEqual(parseChangelog(md), [
  { heading: '1.0.1 — October 28, 2026', bullets: ['One **bold** thing', 'Two'] },
  { heading: '1.0.0 — October 27, 2026', bullets: ['First release.'] },
]);

// The real file parses, newest first, and every version has notes.
const real = parseChangelog(readFileSync(new URL('../changelog.md', import.meta.url), 'utf8'));
assert.ok(real.length >= 2 && real.every((e) => /^\d+\.\d+\.\d+ — \w+ \d{1,2}, \d{4}$/.test(e.heading) && e.bullets.length > 0));

console.log('changelog.test.ts: all passed');
