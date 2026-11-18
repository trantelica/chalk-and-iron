import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Keeps the app's sign-in fresh on every page load (Supabase's standard
// pattern for Next.js). It reads nothing else.
export async function proxy(request: NextRequest) {
  // Old addresses forward to the permanent one (decided 17 Nov 2026), because
  // a passkey only works on the address it was made on. REDIRECT_FROM_HOSTS
  // is a comma-separated list; NEXT_PUBLIC_APP_ORIGIN is the permanent address.
  const from = (process.env.REDIRECT_FROM_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN;
  const host = request.headers.get('host') ?? '';
  if (origin && from.includes(host)) {
    return NextResponse.redirect(new URL(request.nextUrl.pathname + request.nextUrl.search, origin), 308);
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|api/register|api/reset|api/lab/rest-due|.*\\.(?:png|jpg|svg|webp|woff2?)$).*)'],
};
