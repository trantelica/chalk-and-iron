// Protected resource metadata (RFC 9728). ChatGPT and Claude read this to
// learn which sign-in service issues passes for the connector. Served at
//   /.well-known/oauth-protected-resource
//   /.well-known/oauth-protected-resource/mcp

const { config, baseUrl } = require('../lib/config');

function protectedResourceMetadata(req) {
  const base = baseUrl(req);
  return {
    // Must equal the connector link exactly as it is pasted into ChatGPT or Claude.
    resource: base + '/mcp',
    // Claude uses only the first entry. It must equal Supabase's "issuer" exactly.
    authorization_servers: [config().issuer],
    // Supabase's only scopes. They control what goes in ID tokens, not data
    // access: the database's row-level security decides that.
    scopes_supported: ['openid', 'email', 'profile'],
    bearer_methods_supported: ['header'],
    resource_name: 'Chalk and Iron (sign-in proof)',
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, mcp-protocol-version');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 200;
  res.end(JSON.stringify(protectedResourceMetadata(req), null, 2));
};

module.exports.protectedResourceMetadata = protectedResourceMetadata;
