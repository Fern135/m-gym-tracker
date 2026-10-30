/**
 * Copies changelog.md into lib/changelog.content.ts for the What's new screen.
 * Why: the Android release build only re-bundles when a .js/.ts file changes, so an
 * edit to changelog.md alone would ship the old text. npm run phone:android runs this first;
 * lib/changelog.test.ts fails if the two are out of sync.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const md = fs.readFileSync(path.join(root, 'changelog.md'), 'utf8');
const out = `// Generated from changelog.md by scripts/sync-changelog.js. Don't edit; run \`npm run changelog\`.\nexport default ${JSON.stringify(md)};\n`;
const target = path.join(root, 'lib', 'changelog.content.ts');
if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== out) fs.writeFileSync(target, out);
