import { protectedResourceMetadata } from '@/server/connector/config';

// Protected resource metadata (RFC 9728), served at
// /.well-known/oauth-protected-resource and /.well-known/oauth-protected-resource/mcp
// (next.config.ts). ChatGPT and Claude read it to learn that Supabase's
// sign-in service issues the connector's passes.
export const dynamic = 'force-dynamic';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, mcp-protocol-version',
  'Cache-Control': 'no-store',
};

export function GET(request: Request) {
  return Response.json(protectedResourceMetadata(request), { headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}
