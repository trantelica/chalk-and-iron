// Settings for the sign-in proof. Values come from environment variables set
// in Vercel's project settings. Nothing secret is written in this repository.
//
//   SUPABASE_URL              https://<project-ref>.supabase.co  (no trailing slash)
//   SUPABASE_PUBLISHABLE_KEY  the project's publishable (or legacy anon) key. Safe in a browser.
//   SUPABASE_SECRET_KEY       the project's secret (or legacy service_role) key. Server only.
//                             Used by one thing: creating a test account in api/bootstrap.js.
//   PROOF_INVITE_CODE         any long random phrase you choose. Gates test-account creation.
//   PUBLIC_BASE_URL           optional. https://<your-deployment>. Worked out from the request if unset.

function env(name) {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function config() {
  const supabaseUrl = env('SUPABASE_URL').replace(/\/+$/, '');
  return {
    supabaseUrl,
    issuer: supabaseUrl ? supabaseUrl + '/auth/v1' : '',
    publishableKey: env('SUPABASE_PUBLISHABLE_KEY'),
    secretKey: env('SUPABASE_SECRET_KEY'),
    inviteCode: env('PROOF_INVITE_CODE'),
    publicBaseUrl: env('PUBLIC_BASE_URL').replace(/\/+$/, ''),
  };
}

// The address this deployment is reached at, e.g. https://chalk-iron-signin.vercel.app
function baseUrl(req) {
  const fixed = config().publicBaseUrl;
  if (fixed) return fixed;
  const h = (req && req.headers) || {};
  const host = String(h['x-forwarded-host'] || h.host || 'localhost').split(',')[0].trim();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = String(h['x-forwarded-proto'] || (local ? 'http' : 'https')).split(',')[0].trim();
  return proto + '://' + host;
}

module.exports = { config, baseUrl };
