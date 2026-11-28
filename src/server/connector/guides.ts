import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The coach guides (design Section 3, "Coach guides"; Nate approved the
// design on 28 Nov 2026): one short playbook per kind of request, fetched by
// the coach with get_guide. Each is a Markdown file in ./guides, kept in the
// repository so every change goes through a pull request. A file starts with
// a small header between two "---" lines: its topic, version and one line on
// when to read it.
//
// The files are read from disk at run time, from the project folder. Vercel
// copies them beside the server because next.config.ts lists them under
// outputFileTracingIncludes for /mcp; scripts/check-guides-traced.mjs checks
// that after every build, and tests/connector/guides.test.ts reads them here
// exactly as the server does.

export const GUIDE_DIR_PARTS = ['src', 'server', 'connector', 'guides'] as const;

/** The most words a guide may hold, its header left out (design: under 600). */
export const GUIDE_WORD_LIMIT = 600;

export interface Guide {
  topic: string;
  version: number;
  /** One line on when to read it, for the index. */
  when: string;
  /** The guide itself, in Markdown, without its header. */
  text: string;
}

const TOPIC = /^[a-z][a-z_]{0,59}$/;

/** Words as the limits count them: anything with a letter or a digit in it. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

export function parseGuide(file: string, raw: string): Guide {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw.replace(/\r\n/g, '\n'));
  if (!m) throw new Error(`guide ${file}: no header between "---" lines`);
  const head: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) head[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const version = Number(head.version);
  if (!TOPIC.test(head.topic ?? '')) throw new Error(`guide ${file}: topic must be lower case letters and _`);
  if (file !== `${head.topic}.md`) throw new Error(`guide ${file}: the file must be named ${head.topic}.md`);
  if (!Number.isInteger(version) || version < 1) throw new Error(`guide ${file}: version must be a whole number from 1`);
  if (!head.when) throw new Error(`guide ${file}: needs a "when" line`);
  return { topic: head.topic, version, when: head.when, text: m[2].trim() };
}

/** Reads every guide from a folder, A to Z by topic. */
export function readGuides(dir: string): Guide[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => parseGuide(f, readFileSync(join(dir, f), 'utf8')));
}

export function guideDir(): string {
  // Written out in full (not from GUIDE_DIR_PARTS) so the build traces only this folder.
  return join(process.cwd(), 'src', 'server', 'connector', 'guides');
}

// Read once per server: the files only change with a new deployment.
let cache: Guide[] | null = null;

export function allGuides(): Guide[] {
  return (cache ??= readGuides(guideDir()));
}

export function findGuide(topic: string): Guide | undefined {
  return allGuides().find((g) => g.topic === topic);
}

/** The tools that need their guide read first, when enforcement is on (design: "Optional enforcement"). */
export const GUIDE_BEFORE: Record<string, string> = {
  propose_campaign: 'campaign_design',
  propose_workout: 'workout_design',
};

/** How long a guide read counts for the enforcement check. */
export const GUIDE_READ_MINUTES = 30;

/**
 * The single setting for enforcement: off unless the server's setting
 * COACH_GUIDES_REQUIRED is "on" (Vercel, Settings, Environment Variables).
 */
export function guidesRequired(env: Record<string, string | undefined> = process.env): boolean {
  return (env.COACH_GUIDES_REQUIRED ?? '').trim().toLowerCase() === 'on';
}
