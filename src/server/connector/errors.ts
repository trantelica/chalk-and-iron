import type { ZodError } from 'zod';

// Errors, in one shape (design Section 3, "Errors, in one shape"): a plain
// sentence the coach can act on, a code, and where useful a list of problems.
// Every message is written to the coach: what is wrong and how to fix it
// (spec Section 4, "How the coach is shaped", lever 2).

export type ErrorCode =
  | 'not_signed_in'
  | 'not_found'
  | 'invalid_input'
  | 'unknown_vocabulary'
  | 'near_duplicate_name'
  | 'nothing_to_change'
  | 'too_many_requests'
  | 'server_problem';

export interface Problem {
  field: string;
  problem: string;
}

export class ConnectorError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extra: { problems?: Problem[]; retry_after_seconds?: number } & Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function okResult(out: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
}

export function errorResult(e: ConnectorError): ToolResult {
  const error = { code: e.code, message: e.message, ...e.extra };
  const lines = [e.message, ...(e.extra.problems ?? []).map((p) => `- ${p.field}: ${p.problem}`)];
  return { isError: true, content: [{ type: 'text', text: lines.join('\n') + '\n' + JSON.stringify({ error }) }], structuredContent: { error } };
}

export const serverProblem = () =>
  new ConnectorError('server_problem', 'Something failed on the app\'s side. Try again in a minute; if it keeps failing, tell the user the app could not be read.');

/** A tool's inputs that did not pass its checks, as invalid_input with each problem named. */
export function invalidInput(tool: string, err: ZodError): ConnectorError {
  const problems: Problem[] = [];
  for (const issue of err.issues) {
    const path = issue.path.map(String).join('.');
    if (issue.code === 'unrecognized_keys') {
      for (const k of issue.keys) {
        problems.push({ field: path ? `${path}.${k}` : k, problem: `${tool} has no input called "${k}". Leave it out.` });
      }
    } else {
      problems.push({ field: path || '(inputs)', problem: issue.message });
    }
  }
  return new ConnectorError('invalid_input', `Some inputs to ${tool} are not right. Fix each problem listed and call it again.`, { problems });
}
