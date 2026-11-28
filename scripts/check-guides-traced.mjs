// After `npm run build`: checks that every coach guide is in the list of files
// Next.js ships with the /mcp server (its .nft.json trace), which is what
// Vercel copies to the server. Without this, get_guide would find no files on
// the live app. Run by GitHub's test run (.github/workflows/test.yml).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const trace = join(root, '.next', 'server', 'app', 'mcp', 'route.js.nft.json');
const guides = join(root, 'src', 'server', 'connector', 'guides');

let files;
try {
  files = JSON.parse(readFileSync(trace, 'utf8')).files.map((f) => relative(root, resolve(dirname(trace), f)));
} catch (e) {
  console.error(`No trace for /mcp at ${relative(root, trace)}. Run npm run build first. (${e.message})`);
  process.exit(1);
}
const want = readdirSync(guides).filter((f) => f.endsWith('.md')).map((f) => join('src', 'server', 'connector', 'guides', f));
const missing = want.filter((f) => !files.includes(f));
if (want.length === 0 || missing.length) {
  console.error(want.length ? `Coach guides missing from the /mcp server's files: ${missing.join(', ')}` : 'No coach guides found.');
  process.exit(1);
}
console.log(`All ${want.length} coach guides ship with /mcp.`);
