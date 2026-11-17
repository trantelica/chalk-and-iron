// Runs the proof on this computer, routed the same way as vercel.json, so the
// endpoints can be checked without deploying:   node dev-server.js   (port 3000)
// Passkeys and the coach connection need a real HTTPS address, so this is for
// checking the 401 answer, the metadata and the pages only.

const http = require('node:http');
const routes = require('./vercel.json').rewrites;

const handlers = {
  '/api/mcp': () => require('./api/mcp'),
  '/api/metadata': () => require('./api/metadata'),
  '/api/page': () => require('./api/page'),
  '/api/bootstrap': () => require('./api/bootstrap'),
};

function route(pathname) {
  const hit = routes.find((r) => r.source === pathname);
  return hit ? hit.destination : pathname;
}

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const dest = new URL(route(url.pathname), 'http://localhost');
    url.searchParams.forEach((v, k) => dest.searchParams.set(k, v));
    const load = handlers[dest.pathname];
    if (!load) { res.statusCode = 404; return res.end('Not found'); }
    req.query = Object.fromEntries(dest.searchParams);
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      try { req.body = raw ? JSON.parse(raw) : undefined; } catch (e) { req.body = raw; }
      try { await load()(req, res); } catch (e) { console.error(e); res.statusCode = 500; res.end('Server error'); }
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => console.log('Sign-in proof running at http://localhost:' + port));
}

module.exports = { createServer };
