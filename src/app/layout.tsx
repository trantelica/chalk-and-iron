import type { Metadata, Viewport } from 'next';
import '@fontsource/anton/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@/styles/tokens.generated.css';
import '@/styles/globals.css';
import { serverClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Chalk and Iron',
  description: 'Lifting tracker. Your own LLM project is your coach.',
  appleWebApp: { capable: true, title: 'Chalk and Iron', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

async function look() {
  try {
    const supabase = await serverClient();
    const { data } = await supabase.from('profiles').select('skin, accent, background').maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const p = await look();
  return (
    <html lang="en" data-skin={p?.skin ?? 'chalk'} data-accent={p?.accent ?? undefined} data-bg={p?.background ?? 'flat'}>
      <body>{children}</body>
    </html>
  );
}
