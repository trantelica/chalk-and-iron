import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { authenticate as realAuthenticate, type Caller } from './auth';
import { clientName as realClientName, guideReadRecently as realGuideReadRecently, logCall as realLogCall, recentCallTimes as realRecentCallTimes } from './calls';
import { INSTRUCTIONS } from './descriptions';
import { ConnectorError, errorResult, guideNotRead, invalidInput, okResult, serverProblem, type ToolResult } from './errors';
import { GUIDE_BEFORE, GUIDE_READ_MINUTES, guidesRequired as realGuidesRequired } from './guides';
import { MAX_BATCH, MAX_REQUEST_BYTES, tooManyRequests, waitSeconds } from './limits';
import { TOOLS, toolList } from './tools';

// The coach connector at /mcp (design Section 3; spec Section 4, "How it
// connects"). It speaks MCP over HTTPS through the official MCP software kit,
// without sessions: every request carries its own pass and is answered on its
// own, which suits Vercel's servers. It only answers: it never calls out to
// any AI service (rule 1), and a coach's pass can only read, add proposals,
// record a check-in and log its calls (the coach lock, stage 4A).

export const VERSION = '4B';

export interface Deps {
  authenticate: (request: Request) => Promise<Caller | Response>;
  recentCallTimes: (caller: Caller) => Promise<Date[]>;
  logCall: (caller: Caller, clientName: string, tool: string, ok: boolean, topic?: string | null) => Promise<void>;
  clientName: (caller: Caller) => Promise<string>;
  /** The optional enforcement's setting (off unless COACH_GUIDES_REQUIRED is "on"). */
  guidesRequired?: () => boolean;
  /** Whether this coach app read the guide lately; without it, a guide counts as not read. */
  guideReadRecently?: (caller: Caller, clientName: string, topic: string, minutes: number) => Promise<boolean>;
}

const realDeps: Deps = {
  authenticate: realAuthenticate,
  recentCallTimes: realRecentCallTimes,
  logCall: realLogCall,
  clientName: realClientName,
  guidesRequired: () => realGuidesRequired(),
  guideReadRecently: realGuideReadRecently,
};

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id, last-event-id',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
  'Cache-Control': 'no-store',
};

function withHeaders(r: Response): Response {
  const headers = new Headers(r.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers });
}

const rpcError = (status: number, code: number, message: string) =>
  Response.json({ jsonrpc: '2.0', id: null, error: { code, message } }, { status });

/**
 * The optional enforcement (coach guides, off unless switched on): a campaign
 * or workout card needs its guide read by the same coach app in the last 30
 * minutes. Returns the guide still to read, or null. If the call log cannot be
 * read, the card is let through: the check is a nudge, not a lock.
 */
async function guideMissing(deps: Deps, caller: Caller, tool: string, nameP: Promise<string>): Promise<string | null> {
  const needed = GUIDE_BEFORE[tool];
  if (!needed || !(deps.guidesRequired?.() ?? false)) return null;
  if (!deps.guideReadRecently) return needed;
  try {
    return (await deps.guideReadRecently(caller, await nameP, needed, GUIDE_READ_MINUTES)) ? null : needed;
  } catch (e) {
    console.error('CONNECTOR_GUIDE_CHECK_FAILED', String((e as Error)?.message ?? e).slice(0, 200));
    return null;
  }
}

/** One tool call: limits, inputs, the tool itself, then the call log. */
export async function callTool(deps: Deps, caller: Caller, name: string, args: unknown): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw new McpError(ErrorCode.InvalidParams, `There is no tool called "${String(name).slice(0, 60)}". Call tools/list to see the tools.`);
  }
  const nameP = deps.clientName(caller);
  const wait = waitSeconds(await deps.recentCallTimes(caller), new Date());
  // A refused call is not logged, so a coach app that keeps retrying is let
  // through again as soon as its earlier calls age out of the window.
  if (wait !== null) return errorResult(tooManyRequests(wait));

  let result: ToolResult;
  let topic: string | null = null;
  const missing = await guideMissing(deps, caller, name, nameP);
  const parsed = tool.input.safeParse(args ?? {});
  if (missing) {
    result = errorResult(guideNotRead(missing, GUIDE_READ_MINUTES));
  } else if (!parsed.success) {
    result = errorResult(invalidInput(name, parsed.error));
  } else {
    try {
      result = okResult(await tool.run(caller, parsed.data as never));
      topic = tool.topicOf?.(parsed.data as never) ?? null;
    } catch (e) {
      if (e instanceof ConnectorError) result = errorResult(e);
      else {
        console.error('CONNECTOR_TOOL_FAILED', name, String((e as Error)?.message ?? e).slice(0, 300));
        result = errorResult(serverProblem());
      }
    }
  }
  await deps.logCall(caller, await nameP, name, !result.isError, topic);
  return result;
}

function serverFor(deps: Deps, caller: Caller): Server {
  const server = new Server(
    { name: 'chalk-and-iron', title: 'Chalk and Iron', version: VERSION },
    { capabilities: { tools: { listChanged: false } }, instructions: INSTRUCTIONS },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolList() }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => callTool(deps, caller, req.params.name, req.params.arguments));
  return server;
}

export function createMcpHandler(deps: Deps = realDeps) {
  return async function handleMcp(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    // A pass is needed for everything, "initialize" included: that is what
    // starts sign-in in ChatGPT and Claude.
    const caller = await deps.authenticate(request);
    if (caller instanceof Response) return withHeaders(caller);

    if (request.method !== 'POST') {
      // No sessions and no server-sent stream: everything is a POST and its answer.
      const r = rpcError(405, -32000, 'This connector takes MCP requests by POST only.');
      r.headers.set('Allow', 'POST, OPTIONS');
      return withHeaders(r);
    }
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > MAX_REQUEST_BYTES) return withHeaders(rpcError(413, -32600, 'The request is too large.'));
    const text = await request.text();
    if (Buffer.byteLength(text) > MAX_REQUEST_BYTES) return withHeaders(rpcError(413, -32600, 'The request is too large.'));
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return withHeaders(rpcError(400, -32700, 'Parse error: expected a JSON-RPC message.'));
    }
    if (Array.isArray(body) && body.length > MAX_BATCH) {
      return withHeaders(rpcError(400, -32600, `At most ${MAX_BATCH} messages in one request.`));
    }

    const calls = (Array.isArray(body) ? body : [body]) as Array<{ method?: unknown; params?: { name?: unknown } }>;
    // Enough to follow what happened, and no content or email address.
    console.log('MCP ' + JSON.stringify({
      methods: calls.map((m) => String(m?.method ?? '').slice(0, 40)),
      tools: calls.filter((m) => m?.method === 'tools/call').map((m) => String(m.params?.name ?? '').slice(0, 40)),
      client: caller.clientId.slice(0, 8),
      user: caller.userId.slice(0, 8),
    }));

    const server = serverFor(deps, caller);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: MAX_REQUEST_BYTES,
    });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request, { parsedBody: body });
      return withHeaders(response);
    } finally {
      await server.close().catch(() => undefined);
    }
  };
}

export const handleMcp = createMcpHandler();
