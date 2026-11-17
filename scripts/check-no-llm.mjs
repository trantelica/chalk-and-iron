// Spec rule 1 and Section 8: "The codebase contains no outgoing call to any
// LLM service." Fails if any AI library or AI service address appears in the
// app's code or its dependencies.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const SCAN = ['src', 'supabase', 'scripts', 'proofs', 'package.json'];
const SELF = 'scripts/check-no-llm.mjs';
const PATTERNS = [
  /\bopenai\b/i, /@anthropic-ai\//, /\banthropic\.com\b/i, /api\.anthropic/i, /api\.openai/i, /@ai-sdk\//, /\bai-sdk\b/,
  /langchain/i, /llamaindex/i, /generativelanguage\.googleapis/i, /@google\/(generative-ai|genai)/, /vertexai/i,
  /\bcohere\b/i, /mistral(ai)?\.ai|@mistralai/i, /\bgroq\b/i, /replicate\.com/i, /huggingface/i, /\bollama\b/i,
  /openrouter/i, /together\.(ai|xyz)/i, /bedrock-runtime/i, /\bclaude-(opus|sonnet|haiku|fable)/i, /\bgpt-[345o]/i,
];

function* files(p) {
  const s = statSync(p);
  if (s.isFile()) { yield p; return; }
  for (const name of readdirSync(p)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    yield* files(join(p, name));
  }
}

const problems = [];
for (const top of SCAN) {
  let exists = true;
  try { statSync(join(root, top)); } catch { exists = false; }
  if (!exists) continue;
  for (const f of files(join(root, top))) {
    const rel = relative(root, f);
    if (rel === SELF || !/\.(ts|tsx|js|mjs|cjs|json|sql)$/.test(rel)) continue;
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      for (const re of PATTERNS) if (re.test(line)) problems.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
}
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
for (const name of Object.keys(lock.packages ?? {})) {
  if (/node_modules\/(openai|@anthropic-ai\/|@ai-sdk\/|ai$|langchain|@langchain\/|@google\/generative-ai|@google\/genai|cohere-ai|@mistralai\/|groq-sdk|replicate|ollama)/.test(name))
    problems.push(`dependency ${name}`);
}
if (problems.length) {
  console.error('The app must never call an AI service (spec rule 1). Found:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('AI check passed: no AI library or AI service address in the app.');
