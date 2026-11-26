// Settings for the coach connector (design Section 3 and 4). Nothing secret:
// the connector reads with the coach's own pass and never uses the secret key.

export function connectorEnv() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const publishableKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  return {
    supabaseUrl,
    publishableKey,
    /** Supabase's sign-in service: it issues the coach passes. Must equal its own "issuer" exactly. */
    issuer: supabaseUrl ? supabaseUrl + '/auth/v1' : '',
  };
}

/** The address the connector is reached at: the app's permanent address when set, else this request's. */
export function baseUrl(request: Request): string {
  const fixed = (process.env.NEXT_PUBLIC_APP_ORIGIN ?? '').trim().replace(/\/+$/, '');
  if (fixed) return fixed;
  const url = new URL(request.url);
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host).split(',')[0].trim();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = (request.headers.get('x-forwarded-proto') ?? (local ? 'http' : url.protocol.replace(':', ''))).split(',')[0].trim();
  return `${proto}://${host}`;
}

export const CONNECTOR_PATH = '/mcp';

/** Protected resource metadata (RFC 9728): tells ChatGPT and Claude who issues passes for the connector. */
export function protectedResourceMetadata(request: Request) {
  return {
    // Must equal the connector link exactly as it is pasted into ChatGPT or Claude.
    resource: baseUrl(request) + CONNECTOR_PATH,
    // Claude uses only the first entry.
    authorization_servers: [connectorEnv().issuer],
    // Supabase's only scopes. They shape ID tokens, not data access: the
    // database's row-level security and the coach lock decide that.
    scopes_supported: ['openid', 'email', 'profile'],
    bearer_methods_supported: ['header'],
    resource_name: 'Chalk and Iron',
  };
}
