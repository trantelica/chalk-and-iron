// Spec rule 7 and Section 8: "No color or font value appears outside the
// theme token files." Scans the app's own code and fails if it finds one.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const SCAN = ['src', 'public'];
const SKIP = new Set(['src/styles/tokens.generated.css']);
const EXT = /\.(ts|tsx|js|jsx|mjs|css|html|svg|json)$/;

const FONT_NAMES = ['Anton', 'Inter', 'Bungee', 'Space Grotesk', 'Outfit', 'Arial', 'Helvetica', 'Impact', 'Times', 'Georgia', 'Courier', 'Roboto', 'system-ui', 'sans-serif', 'serif', 'monospace'];
const NAMED_COLORS = ['white', 'black', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'gray', 'grey', 'silver', 'navy', 'teal', 'maroon', 'crimson', 'gold'];
const RULES = [
  [/#[0-9a-fA-F]{3,8}\b(?![-\w])/, 'a color code'],
  [/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/, 'a color function'],
  [new RegExp(`(color|background|border|fill|stroke|outline|shadow)[\\w-]*\\s*[:=]\\s*['"]?(${NAMED_COLORS.join('|')})\\b`, 'i'), 'a named color'],
  [/font-family\s*:(?!\s*(var\(|inherit))/i, 'a font family'],
  [/fontFamily\s*:\s*['"`](?!var\()/, 'a font family'],
  [new RegExp(`['"\`](${FONT_NAMES.join('|')})['"\`,]`), 'a font name'],
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (EXT.test(name)) yield p;
  }
}

const problems = [];
for (const top of SCAN) {
  let ok = true;
  try { statSync(join(root, top)); } catch { ok = false; }
  if (!ok) continue;
  for (const f of files(join(root, top))) {
    const rel = relative(root, f);
    if (SKIP.has(rel)) continue;
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/style-check: allow/.test(line)) return;
      for (const [re, what] of RULES) if (re.test(line)) problems.push(`${rel}:${i + 1} has ${what}: ${line.trim().slice(0, 120)}`);
    });
  }
}
if (problems.length) {
  console.error('Colors and fonts must come from theme tokens (tokens/). Found:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('Style check passed: no color or font outside the theme token files.');
