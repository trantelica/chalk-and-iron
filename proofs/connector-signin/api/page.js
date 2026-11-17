// The proof's web pages:
//   /                 readiness checks and the connector link
//   /oauth/consent    the page Supabase sends ChatGPT or Claude users to, to approve the coach
//   /passkey          make a passkey-only test account, sign in, list and disconnect coach apps
//   /manifest.webmanifest   lets /passkey be added to the iPhone home screen
//
// Plain HTML. The browser pages load supabase-js from a CDN at a pinned version.
// Every piece of text that comes from outside (client names, emails) is shown
// with textContent, never as HTML, because any app can register itself as a client.

const { config, baseUrl } = require('../lib/config');
const { protectedResourceMetadata } = require('./metadata');

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

const STYLE = `
:root{--bg:#0d0d0d;--fg:#f2efe6;--mut:#b5b1a6;--line:#33312d;--accent:#ff5a26;--ok:#5fd38d;--bad:#ff6b6b;--box:#1a1917}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,sans-serif}
main{max-width:720px;margin:0 auto;padding:24px 16px 64px}h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px;color:var(--accent)}
p,li{color:#d9d5ca}.mut{color:var(--mut);font-size:14px}code{background:#1f1e1b;padding:2px 6px;word-break:break-all}
button{min-height:44px;padding:0 16px;margin:4px 8px 4px 0;background:var(--accent);color:#0d0d0d;border:0;font-weight:700;font-size:15px;cursor:pointer;border-radius:6px}
button.sec{background:transparent;color:var(--fg);border:1px solid var(--line)}button:disabled{opacity:.5}
input{width:100%;min-height:44px;padding:8px 10px;margin:4px 0 8px;background:var(--box);color:var(--fg);border:1px solid var(--line);border-radius:6px;font-size:16px}
.box{border:1px solid var(--line);padding:12px;margin:8px 0;border-radius:6px}.ok{color:var(--ok)}.bad{color:var(--bad)}
pre{white-space:pre-wrap;word-break:break-word;background:var(--box);padding:10px;font-size:13px;margin:8px 0 0;border-radius:6px}
.big{font-size:20px;font-weight:700;margin:8px 0}`;

function shell(title, body, extraHead = '') {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark"><title>${esc(title)}</title>${extraHead}<style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}

// Shared browser code: one Supabase client, kept signed in on this device.
function clientScript(cfg) {
  return `<script id="cfg" type="application/json">${json({ url: cfg.supabaseUrl, key: cfg.publishableKey })}</script>
<script type="module">
import { createClient } from '${SUPABASE_JS}';
const cfg = JSON.parse(document.getElementById('cfg').textContent);
window.sb = createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, experimental: { passkey: true } } });
window.dispatchEvent(new Event('sb-ready'));
</script>`;
}

const HELPERS = `<script>
function $(id){return document.getElementById(id)}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function errText(e){return (e&&(e.code?e.code+': ':'')+(e.message||String(e)))||'unknown error'}
var LOG=[];function log(line){LOG.push(new Date().toISOString().slice(11,19)+'  '+line);var o=$('log');if(o){o.hidden=false;o.textContent=LOG.join('\\n')}}
function envLine(){var standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
return 'Where: '+(standalone?'home-screen app':'browser tab')+' | WebAuthn: '+(window.PublicKeyCredential?'yes':'no')+' | '+navigator.userAgent}
function whenReady(fn){if(window.sb)fn();else window.addEventListener('sb-ready',fn,{once:true})}
</script>`;

// ---------- / : readiness checks ----------

async function readiness(req) {
  const cfg = config();
  const checks = [];
  const add = (ok, label, detail) => checks.push({ ok, label, detail: detail || '' });
  add(Boolean(cfg.supabaseUrl), 'SUPABASE_URL is set');
  add(Boolean(cfg.publishableKey), 'SUPABASE_PUBLISHABLE_KEY is set');
  add(Boolean(cfg.secretKey), 'SUPABASE_SECRET_KEY is set', 'Only needed for making test accounts.');
  add(Boolean(cfg.inviteCode), 'PROOF_INVITE_CODE is set', 'Only needed for making test accounts.');
  let meta = null;
  if (cfg.supabaseUrl) {
    const metaUrl = cfg.supabaseUrl + '/.well-known/oauth-authorization-server/auth/v1';
    try {
      const r = await fetch(metaUrl);
      meta = r.ok ? await r.json() : null;
      add(Boolean(meta), 'Supabase publishes its sign-in server details', meta ? metaUrl : 'HTTP ' + r.status + ' from ' + metaUrl + '. Is the OAuth Server turned on?');
    } catch (e) {
      add(false, 'Supabase publishes its sign-in server details', String(e && e.message));
    }
    if (meta) {
      add(meta.issuer === cfg.issuer, 'Issuer matches what the connector points to', 'Supabase says ' + meta.issuer + '; connector says ' + cfg.issuer);
      add((meta.code_challenge_methods_supported || []).includes('S256'), 'PKCE S256 supported (ChatGPT and Claude require it)');
      add(Boolean(meta.registration_endpoint), 'Dynamic client registration is on', meta.registration_endpoint || 'Turn on "Allow dynamic client registration" under Authentication > OAuth Server. ChatGPT and Claude need it, because Supabase does not offer client ID metadata documents.');
      add((meta.token_endpoint_auth_methods_supported || []).includes('none'), 'Public clients allowed ("none" token auth)');
      add(true, 'Client ID metadata documents (CIMD): ' + (meta.client_id_metadata_document_supported ? 'advertised' : 'not advertised, as expected'), 'For information. Without CIMD, ChatGPT and Claude register themselves (DCR).');
    }
    try {
      const r = await fetch(cfg.issuer + '/.well-known/jwks.json');
      const keys = r.ok ? ((await r.json()).keys || []) : [];
      const usable = keys.filter((k) => k.alg === 'ES256' || k.alg === 'RS256' || k.kty === 'EC' || k.kty === 'RSA');
      add(usable.length > 0, 'Asymmetric signing keys published (needed to check passes)', usable.length ? usable.length + ' key(s): ' + usable.map((k) => k.alg || k.kty).join(', ') : 'None. In Supabase, go to Settings > JWT Keys, migrate and rotate to an ECC (P-256) key.');
    } catch (e) {
      add(false, 'Asymmetric signing keys published', String(e && e.message));
    }
  }
  return { checks, meta, prm: protectedResourceMetadata(req) };
}

async function homePage(req) {
  const base = baseUrl(req);
  const { checks, meta, prm } = await readiness(req);
  const rows = checks.map((c) => `<div class="box"><span class="${c.ok ? 'ok' : 'bad'}">${c.ok ? 'OK' : 'NOT YET'}</span> ${esc(c.label)}${c.detail ? `<div class="mut">${esc(c.detail)}</div>` : ''}</div>`).join('');
  return shell('Sign-in proof', `
<h1>Chalk and Iron: sign-in proof</h1>
<p class="mut">A throwaway test. It checks that ChatGPT and Claude can sign in to the connector, and that a passkey alone can sign you in. No training data.</p>
<h2>Connector link</h2><p><code>${esc(base)}/mcp</code></p><p class="mut">Paste this into ChatGPT or Claude.</p>
<h2>Readiness</h2>${rows}
<h2>Pages</h2><p><a href="/passkey" style="color:var(--accent)">Passkey test page</a> (make the test account here first)</p>
<p class="mut">The consent page at <code>/oauth/consent</code> opens by itself during a coach connection.</p>
<h2>Details for an agent</h2><p class="mut">Protected resource metadata (served at /.well-known/oauth-protected-resource)</p><pre>${esc(JSON.stringify(prm, null, 2))}</pre>
<p class="mut">Supabase sign-in server metadata</p><pre>${esc(meta ? JSON.stringify(meta, null, 2) : 'not available')}</pre>`);
}

// ---------- /oauth/consent ----------

function consentPage(cfg) {
  return shell('Allow coach access', `
<h1>Chalk and Iron</h1>
<div id="status" class="mut">Loading...</div>
<div id="signin" hidden>
  <p>Sign in to approve this connection.</p>
  <button id="pk">Sign in with passkey</button>
  <p class="mut">No account yet? Make the test account on the <a href="/passkey" style="color:var(--accent)">passkey page</a> first, then start the connection again.</p>
</div>
<div id="ask" hidden>
  <p class="big" id="question"></p>
  <p class="mut" id="who"></p>
  <p class="mut" id="where"></p>
  <button id="allow">Allow</button><button id="deny" class="sec">Deny</button>
  <p><button id="other" class="sec">Not you? Sign out</button></p>
</div>
<pre id="log" hidden></pre>
${HELPERS}${clientScript(cfg)}
<script>
var authId=new URLSearchParams(location.search).get('authorization_id');
log(envLine());
whenReady(start);
async function start(){
  if(!authId){$('status').textContent='This page opens during a coach connection. There is nothing to approve right now.';return}
  var s=await sb.auth.getSession();
  if(!s.data.session){$('status').textContent='';$('signin').hidden=false;log('No sign-in on this page yet.');return}
  showRequest();
}
$('pk').onclick=async function(){
  this.disabled=true;log('Passkey sign-in started.');
  var r=await sb.auth.signInWithPasskey();this.disabled=false;
  if(r.error){log('Passkey sign-in FAILED: '+errText(r.error));$('status').textContent='Passkey sign-in did not work: '+errText(r.error);return}
  log('Passkey sign-in OK.');$('signin').hidden=true;showRequest();
};
async function showRequest(){
  $('status').textContent='Checking the request...';
  var r=await sb.auth.oauth.getAuthorizationDetails(authId);
  if(r.error){$('status').textContent='Could not read the request: '+errText(r.error);log('getAuthorizationDetails FAILED: '+errText(r.error));return}
  var d=r.data||{};
  if(d.redirect_url&&!d.authorization_id){log('Already approved before. Returning to the coach app.');$('status').textContent='Already approved. Returning...';location.assign(d.redirect_url);return}
  var name=(d.client&&d.client.name)||'An app';var host='';try{host=new URL(d.redirect_uri).host}catch(e){host=d.redirect_uri||'unknown'}
  $('question').textContent='Allow '+name+' to read your training data and send you proposals?';
  $('who').textContent='Signed in as '+((d.user&&d.user.email)||'unknown')+'.';
  $('where').textContent='After you answer you go back to '+host+'. Requested: '+(d.scope||'(no scopes)')+'.';
  $('status').textContent='';$('ask').hidden=false;
  log('Request from client "'+name+'" ('+((d.client&&d.client.id)||'?')+'), returns to '+host+'.');
}
$('allow').onclick=async function(){$('allow').disabled=$('deny').disabled=true;log('Allow pressed.');
  var r=await sb.auth.oauth.approveAuthorization(authId);
  if(r.error){log('Approve FAILED: '+errText(r.error));$('status').textContent='Could not approve: '+errText(r.error);$('allow').disabled=$('deny').disabled=false;return}
  $('status').textContent='Approved. Returning to the coach app...';};
$('deny').onclick=async function(){$('allow').disabled=$('deny').disabled=true;log('Deny pressed.');
  var r=await sb.auth.oauth.denyAuthorization(authId);
  if(r.error){log('Deny FAILED: '+errText(r.error));$('status').textContent='Could not deny: '+errText(r.error);return}
  $('status').textContent='Denied. Returning to the coach app...';};
$('other').onclick=async function(){await sb.auth.signOut({scope:'local'});location.reload()};
</script>`);
}

// ---------- /passkey ----------

function passkeyPage(cfg, base) {
  const head = `<link rel="manifest" href="/manifest.webmanifest"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="C&amp;I proof">`;
  return shell('Passkey test', `
<h1>Passkey test</h1>
<p class="mut" id="env"></p>
<div class="box"><div id="me">Checking...</div></div>

<h2>1. Make the test account</h2>
<p class="mut">Stands in for an invite link. Creates the account and a passkey. No email is sent and there is no password.</p>
<label>Email (a contact detail only)<input id="email" type="email" autocomplete="email"></label>
<label>Invite code<input id="code" type="password" autocomplete="off"></label>
<button id="make">Create account and passkey</button>

<h2>2. Sign in</h2>
<button id="signin">Sign in with passkey</button><button id="signout" class="sec">Sign out on this device</button><button id="addpk" class="sec">Add another passkey</button>

<h2>3. My passkeys</h2><div id="pks" class="mut">Sign in to see them.</div>

<h2>4. Connected coach apps</h2>
<p class="mut">Disconnect here, then ask the coach to call get_profile again. It should be asked to sign in again.</p>
<div id="grants" class="mut">Sign in to see them.</div>

<h2>5. Call the connector as this app sign-in</h2>
<p class="mut">Should answer with is_coach_pass: false, which shows the connector can tell an app sign-in from a coach pass.</p>
<button id="call" class="sec">Call get_profile</button><pre id="callout" hidden></pre>

<h2>Results log</h2><p class="mut">Copy this into the results checklist.</p><button id="copy" class="sec">Copy log</button><pre id="log" hidden></pre>
${HELPERS}${clientScript(cfg)}
<script>
var BASE=${json(base)};
$('env').textContent=envLine();log(envLine());
if(window.PublicKeyCredential&&PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable){PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(function(v){log('Face ID / Touch ID passkeys available: '+(v?'yes':'no'))})}
whenReady(function(){sb.auth.onAuthStateChange(function(){setTimeout(refresh,0)});refresh()});

async function refresh(){
  var s=(await sb.auth.getSession()).data.session;
  if(!s){$('me').textContent='Not signed in on this device.';$('pks').textContent='Sign in to see them.';$('grants').textContent='Sign in to see them.';return}
  var c=await sb.auth.getClaims();var cl=(c.data&&c.data.claims)||{};
  var how=(cl.amr||[]).map(function(m){return m.method||m}).join(', ');
  $('me').textContent='Signed in as '+(cl.email||s.user.email)+' (signed in with: '+(how||'?')+').';
  var p=await sb.auth.passkey.list();var box=$('pks');box.textContent='';
  if(p.error){box.textContent='Could not list passkeys: '+errText(p.error)}
  else if(!(p.data||[]).length){box.textContent='None.'}
  else (p.data||[]).forEach(function(k){var row=el('div','box');row.appendChild(el('div',null,(k.friendly_name||'Passkey')+'  ·  made '+String(k.created_at||'').slice(0,10)));var b=el('button','sec','Delete');b.onclick=async function(){var r=await sb.auth.passkey.delete({passkeyId:k.id});log('Delete passkey: '+(r.error?'FAILED '+errText(r.error):'OK'));refresh()};row.appendChild(b);box.appendChild(row)});
  var g=await sb.auth.oauth.listGrants();var gb=$('grants');gb.textContent='';
  if(g.error){gb.textContent='Could not list coach apps: '+errText(g.error)}
  else if(!(g.data||[]).length){gb.textContent='None connected.'}
  else (g.data||[]).forEach(function(x){var row=el('div','box');row.appendChild(el('div',null,((x.client&&x.client.name)||'App')+'  ·  id '+((x.client&&x.client.id)||'?')+'  ·  since '+String(x.granted_at||'').slice(0,16)));var b=el('button','sec','Disconnect');b.onclick=async function(){var r=await sb.auth.oauth.revokeGrant({clientId:x.client.id});log('Disconnect '+((x.client&&x.client.name)||'')+': '+(r.error?'FAILED '+errText(r.error):'OK'));refresh()};row.appendChild(b);gb.appendChild(row)});
}

$('make').onclick=async function(){
  var b=this;b.disabled=true;
  try{
    log('Creating test account...');
    var r=await fetch('/api/bootstrap',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:$('email').value,code:$('code').value})});
    var j=await r.json();if(!r.ok){log('Create account FAILED: '+(j.error||r.status));return}
    log('Account '+(j.new_account?'created':'already existed')+'. Signing in with the one-time token...');
    var v=await sb.auth.verifyOtp({token_hash:j.token_hash,type:j.type});
    if(v.error){log('One-time sign-in FAILED: '+errText(v.error));return}
    log('Signed in. Now creating a passkey (Face ID or Touch ID)...');
    var p=await sb.auth.registerPasskey();
    if(p.error){log('Create passkey FAILED: '+errText(p.error));return}
    log('Passkey created. Next: press "Sign out on this device", then "Sign in with passkey".');
  }catch(e){log('ERROR: '+errText(e))}finally{b.disabled=false;refresh()}
};
$('signin').onclick=async function(){log('Passkey sign-in started.');var r=await sb.auth.signInWithPasskey();log('Passkey sign-in: '+(r.error?'FAILED '+errText(r.error):'OK'));refresh()};
$('signout').onclick=async function(){await sb.auth.signOut({scope:'local'});log('Signed out on this device.');refresh()};
$('addpk').onclick=async function(){var r=await sb.auth.registerPasskey();log('Add passkey: '+(r.error?'FAILED '+errText(r.error):'OK'));refresh()};
$('call').onclick=async function(){
  var s=(await sb.auth.getSession()).data.session;var o=$('callout');o.hidden=false;
  if(!s){o.textContent='Sign in first.';return}
  var r=await fetch(BASE+'/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',authorization:'Bearer '+s.access_token},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_profile',arguments:{}}})});
  var t=await r.text();var out;try{var j=JSON.parse(t);out=j.result&&j.result.structuredContent?j.result.structuredContent:j}catch(e){out=t}
  o.textContent=typeof out==='string'?out:JSON.stringify(out,null,2);
  log('App sign-in get_profile: HTTP '+r.status+(out&&typeof out==='object'&&'is_coach_pass' in out?', is_coach_pass '+out.is_coach_pass:''));
};
$('copy').onclick=function(){navigator.clipboard&&navigator.clipboard.writeText(LOG.join('\\n')).then(function(){log('Log copied.')})};
</script>`, head);
}

function manifest() {
  return JSON.stringify({ name: 'Chalk and Iron sign-in proof', short_name: 'C&I proof', start_url: '/passkey', scope: '/', display: 'standalone', background_color: '#0d0d0d', theme_color: '#0d0d0d' });
}

module.exports = async (req, res) => {
  const page = (req.query && req.query.p) || new URL(req.url, 'http://x').searchParams.get('p') || 'home';
  const cfg = config();
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY'); // the consent page must never be framed
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (page === 'manifest') { res.setHeader('Content-Type', 'application/manifest+json'); return res.end(manifest()); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (page === 'consent') return res.end(consentPage(cfg));
  if (page === 'passkey') return res.end(passkeyPage(cfg, baseUrl(req)));
  return res.end(await homePage(req));
};
