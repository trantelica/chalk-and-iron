// Chalk and Iron, Phase 0: a throwaway connector for testing whether an LLM
// client can read from and propose to the app over MCP (streamable HTTP).
// Sample data only. No sign-in. Proposals are held in memory and are lost
// whenever the function instance restarts.

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const state = globalThis.__chalkIron || (globalThis.__chalkIron = { proposals: [], calls: [], started: new Date().toISOString(), n: 0 });

const TODAY = {
  note: 'SAMPLE DATA for a connection test. Not real training history.',
  workout: 'Push Day A',
  gym: 'Iron Works (sample)',
  exercises: [
    { name: 'Incline Dumbbell Press', superset: 'A', sets: 4, reps: 8, weight: '60 lb', equipment: 'dumbbell', last_session: '60 lb x 8, 8, 7' },
    { name: 'Cable Fly', superset: 'A', sets: 4, reps: 12, weight: '18 kg', equipment: 'cable', last_session: '18 kg x 12, 12, 11' },
    { name: 'Overhead Press', superset: null, sets: 3, reps: 6, weight: '95 lb', equipment: 'barbell', last_session: '95 lb x 6, 6, 5' },
    { name: 'Lateral Raise', superset: null, sets: 3, reps: 12, weight: '20 lb', equipment: 'dumbbell', last_session: '20 lb x 12, 12, 12' },
    { name: 'Triceps Pushdown', superset: null, sets: 3, reps: 10, weight: '25 kg', equipment: 'cable', last_session: '25 kg x 10, 10, 9' },
  ],
};

const HISTORY = {
  'incline dumbbell press': [['Oct 5', '50 lb', [8, 8, 7]], ['Oct 12', '50 lb', [8, 8, 8]], ['Oct 19', '55 lb', [8, 7, 7]], ['Oct 26', '55 lb', [8, 8, 8]], ['Nov 2', '60 lb', [8, 7, 6]], ['Nov 9', '60 lb', [8, 8, 7]]],
  'overhead press': [['Oct 5', '85 lb', [6, 6, 5]], ['Oct 12', '85 lb', [6, 6, 6]], ['Oct 19', '90 lb', [6, 5, 5]], ['Oct 26', '90 lb', [6, 6, 6]], ['Nov 2', '95 lb', [6, 5, 5]], ['Nov 9', '95 lb', [6, 6, 5]]],
};

const str = { type: 'string' };
const summary = { type: 'array', minItems: 1, items: str, description: 'One short, plain-language line per change. This is what the user reads before accepting.' };
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

const TOOLS = [
  { name: 'get_today', title: "Get today's workout", description: "Returns the workout planned for today in Chalk and Iron, with each exercise's sets, reps, weight, equipment and last session. Sample data.", inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: read },
  { name: 'get_exercise_history', title: 'Get exercise history', description: 'Returns recent sessions for one exercise: date, weight and reps per set. Sample data exists for Incline Dumbbell Press and Overhead Press.', inputSchema: { type: 'object', properties: { exercise: { type: 'string', description: 'Exercise name' } }, required: ['exercise'], additionalProperties: false }, annotations: read },
  { name: 'propose_today_change', title: "Propose a change to today's workout", description: "Sends a proposed change to today's workout to the user's Chalk and Iron inbox. Nothing changes until the user accepts it in the app. Use for one-day changes such as swapping an exercise or adjusting sets, reps, weight or rest.", inputSchema: { type: 'object', properties: { summary_lines: summary, changes: { type: 'array', description: 'The structured changes.', items: { type: 'object', properties: { exercise: str, action: { type: 'string', enum: ['swap', 'set_sets', 'set_reps', 'set_weight', 'set_rest', 'add', 'remove'] }, value: { type: 'string', description: 'New exercise name, or the new number with its unit.' } }, required: ['exercise', 'action'] } } }, required: ['summary_lines'] }, annotations: write },
  { name: 'propose_profile_update', title: 'Propose a coach profile update', description: "Sends a proposed update to the user's coach profile (goals, injuries and limits, weekly schedule, notes) to their Chalk and Iron inbox. Nothing changes until the user accepts it in the app.", inputSchema: { type: 'object', properties: { summary_lines: summary, goals: str, injuries: str, schedule: str, notes: str }, required: ['summary_lines'] }, annotations: write },
  { name: 'get_proposal_status', title: 'Get proposal status', description: 'Returns whether a proposal is pending, accepted or rejected.', inputSchema: { type: 'object', properties: { proposal_id: str }, required: ['proposal_id'], additionalProperties: false }, annotations: read },
];

const clip = (v, n = 2000) => String(v == null ? '' : v).slice(0, n);
const ok = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }], structuredContent: obj });
const fail = (msg) => ({ content: [{ type: 'text', text: msg }], isError: true });

function propose(kind, args, client) {
  const lines = Array.isArray(args.summary_lines) ? args.summary_lines.slice(0, 20).map((l) => clip(l, 300)) : [];
  if (!lines.length) return fail('summary_lines is required: give one short plain-language line per change.');
  const id = 'prop_' + (++state.n) + '_' + Date.now().toString(36);
  const detail = {};
  for (const k of ['goals', 'injuries', 'schedule', 'notes']) if (args[k]) detail[k] = clip(args[k]);
  if (Array.isArray(args.changes)) detail.changes = args.changes.slice(0, 30).map((c) => ({ exercise: clip(c && c.exercise, 120), action: clip(c && c.action, 40), value: clip(c && c.value, 120) }));
  const p = { id, kind, status: 'pending', received: new Date().toISOString(), client, summary_lines: lines, detail };
  state.proposals.unshift(p);
  state.proposals.length = Math.min(state.proposals.length, 50);
  console.log('PROPOSAL ' + JSON.stringify(p));
  return ok({ proposal_id: id, status: 'pending', message: 'Proposal received. It is waiting for the user to accept or decline it in the Chalk and Iron app. Nothing has changed yet.' });
}

function callTool(name, args, client) {
  args = args && typeof args === 'object' ? args : {};
  if (name === 'get_today') return ok(TODAY);
  if (name === 'get_exercise_history') {
    const h = HISTORY[clip(args.exercise, 120).trim().toLowerCase()];
    if (!h) return ok({ exercise: clip(args.exercise, 120), sessions: [], note: 'No sample history for this exercise. Sample data exists for Incline Dumbbell Press and Overhead Press.' });
    return ok({ exercise: args.exercise, note: 'SAMPLE DATA', sessions: h.map(([date, weight, reps]) => ({ date, weight, reps })) });
  }
  if (name === 'propose_today_change') return propose('today_change', args, client);
  if (name === 'propose_profile_update') return propose('profile_update', args, client);
  if (name === 'get_proposal_status') {
    const p = state.proposals.find((x) => x.id === args.proposal_id);
    return p ? ok({ proposal_id: p.id, status: p.status }) : ok({ proposal_id: clip(args.proposal_id, 80), status: 'unknown', note: 'This test server keeps proposals in memory only and may have restarted.' });
  }
  return null;
}

function handle(msg, client) {
  const { id, method, params } = msg || {};
  const isNote = id === undefined || id === null;
  const entry = { t: new Date().toISOString(), method: clip(method, 60), tool: method === 'tools/call' ? clip(params && params.name, 60) : undefined, client };
  state.calls.unshift(entry);
  state.calls.length = Math.min(state.calls.length, 60);
  console.log('RPC ' + JSON.stringify(entry));
  if (isNote) return null;
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const error = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (method === 'initialize') {
    const asked = params && params.protocolVersion;
    return reply({ protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'chalk-and-iron-phase0', title: 'Chalk and Iron (connection test)', version: '0.1.0' }, instructions: 'Test connector for the Chalk and Iron lifting app. All data is sample data. Read tools return a sample workout and history. Propose tools send a proposal to the user for approval and never change anything directly.' });
  }
  if (method === 'ping') return reply({});
  if (method === 'tools/list') return reply({ tools: TOOLS });
  if (method === 'tools/call') {
    const out = callTool(params && params.name, params && params.arguments, client);
    return out ? reply(out) : error(-32602, 'Unknown tool: ' + clip(params && params.name, 60));
  }
  if (method === 'resources/list') return reply({ resources: [] });
  if (method === 'prompts/list') return reply({ prompts: [] });
  return error(-32601, 'Method not found: ' + clip(method, 60));
}

const PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Chalk and Iron: Phase 0 connector test</title>
<style>body{margin:0;background:#0d0d0d;color:#f2efe6;font:16px/1.5 system-ui,sans-serif}main{max-width:760px;margin:0 auto;padding:24px 18px 60px}h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px;color:#ff5a26}p,li{color:#d9d5ca}code{background:#1f1e1b;padding:2px 6px;word-break:break-all}button{min-height:44px;padding:0 16px;background:#ff5a26;color:#0d0d0d;border:0;font-weight:700;font-size:15px;cursor:pointer}.box{border:1px solid #33312d;padding:12px;margin:8px 0}.mut{color:#b5b1a6;font-size:14px}pre{white-space:pre-wrap;word-break:break-word;background:#1a1917;padding:10px;font-size:13px;margin:8px 0 0}</style></head><body><main>
<h1>Chalk and Iron: Phase 0 connector test</h1><p class="mut">A throwaway test service. Sample data only, no sign-in. Proposals are kept in memory and can vanish at any time.</p>
<h2>Connector link</h2><p><code id="url"></code></p>
<h2>Self-test</h2><p class="mut">Checks from this browser that the connector answers, lists its tools, reads the sample workout and accepts a proposal.</p><button id="run">Run self-test</button><pre id="out" hidden></pre>
<h2>Proposals received</h2><div id="props"><p class="mut">None yet.</p></div>
<h2>Recent calls</h2><p class="mut">Every request a client makes to the connector. Refreshes every 5 seconds.</p><div id="calls"><p class="mut">None yet.</p></div>
</main><script>
var u=location.origin+'/mcp';document.getElementById('url').textContent=u;
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function draw(s){var p=document.getElementById('props');p.textContent='';if(!s.proposals.length)p.appendChild(el('p','mut','None yet.'));
s.proposals.forEach(function(x){var b=el('div','box');b.appendChild(el('div','mut',x.kind+' · '+x.status+' · '+x.received+' · '+(x.client||'unknown client')));x.summary_lines.forEach(function(l){b.appendChild(el('div',null,l))});if(Object.keys(x.detail).length)b.appendChild(el('pre',null,JSON.stringify(x.detail,null,2)));p.appendChild(b)});
var c=document.getElementById('calls');c.textContent='';if(!s.calls.length)c.appendChild(el('p','mut','None yet.'));
s.calls.forEach(function(x){c.appendChild(el('div','mut',x.t+'  '+x.method+(x.tool?'  '+x.tool:'')+'  ·  '+(x.client||'')))})}
function load(){fetch('/?view=state').then(function(r){return r.json()}).then(draw).catch(function(){})}
function rpc(id,method,params){return fetch('/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:id,method:method,params:params||{}})}).then(function(r){return r.json()})}
document.getElementById('run').onclick=function(){var o=document.getElementById('out');o.hidden=false;o.textContent='Running...';var log=[];
rpc(1,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'self-test',version:'1'}}).then(function(r){log.push('initialize: '+(r.result?'ok, server '+r.result.serverInfo.name:'FAILED'));return rpc(2,'tools/list')})
.then(function(r){log.push('tools/list: '+(r.result?r.result.tools.map(function(t){return t.name}).join(', '):'FAILED'));return rpc(3,'tools/call',{name:'get_today',arguments:{}})})
.then(function(r){log.push('get_today: '+(r.result&&!r.result.isError?'ok, '+r.result.structuredContent.workout:'FAILED'));return rpc(4,'tools/call',{name:'propose_today_change',arguments:{summary_lines:['Self-test: Overhead Press becomes Dumbbell Shoulder Press'],changes:[{exercise:'Overhead Press',action:'swap',value:'Dumbbell Shoulder Press'}]}})})
.then(function(r){log.push('propose_today_change: '+(r.result&&!r.result.isError?'ok, '+r.result.structuredContent.proposal_id+' is '+r.result.structuredContent.status:'FAILED'));o.textContent=log.join('\\n');load()})
.catch(function(e){log.push('ERROR: '+e);o.textContent=log.join('\\n')})};
load();setInterval(load,5000);
</script></body></html>`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const view = (req.query && req.query.view) || '';
  if (req.method === 'GET' && view === 'page') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(PAGE); }
  if (req.method === 'GET' && view === 'state') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ started: state.started, proposals: state.proposals, calls: state.calls })); }
  if (req.method !== 'POST') { res.statusCode = 405; res.setHeader('Allow', 'POST, OPTIONS'); res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'This endpoint accepts MCP requests by POST only.' } })); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = undefined; } }
  if (!body || typeof body !== 'object') { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: expected a JSON-RPC message.' } })); }
  const client = clip(req.headers && req.headers['user-agent'], 120);
  const batch = Array.isArray(body);
  const replies = (batch ? body.slice(0, 20) : [body]).map((m) => handle(m, client)).filter(Boolean);
  if (!replies.length) { res.statusCode = 202; return res.end(); }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(batch ? replies : replies[0]));
};
