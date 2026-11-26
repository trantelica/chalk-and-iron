import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    // Where ChatGPT and Claude look for who signs coaches in (RFC 9728).
    return [
      { source: '/.well-known/oauth-protected-resource', destination: '/api/connector/metadata' },
      { source: '/.well-known/oauth-protected-resource/mcp', destination: '/api/connector/metadata' },
    ];
  },
  async headers() {
    // The page where a person allows a coach app must never be shown inside another page.
    return [{ source: '/oauth/consent', headers: [{ key: 'X-Frame-Options', value: 'DENY' }, { key: 'Referrer-Policy', value: 'no-referrer' }] }];
  },
};

export default nextConfig;
