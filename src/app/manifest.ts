import type { MetadataRoute } from 'next';

// Makes the app installable to the iPhone home screen as its own app, which
// an iPhone needs before it allows notifications (spec Section 7). Colors are
// left out on purpose: every color comes from the theme tokens (rule 7).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Chalk and Iron',
    short_name: 'Chalk and Iron',
    description: 'Lifting tracker. Your own LLM project is your coach.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
  };
}
