import { NextResponse } from 'next/server';
import { checkLink, registerFromInvite } from '@/server/accounts';
import { body, fail, str } from '@/server/http';

// POST { code } checks an invite. POST { code, email, name, timeZone, register: true } uses it.
export async function POST(req: Request) {
  try {
    const b = await body(req);
    const code = str(b.code, 200);
    if (!b.register) {
      const link = await checkLink(code);
      return NextResponse.json({ valid: link.valid && link.purpose === 'invite', reason: link.reason, label: link.label });
    }
    const out = await registerFromInvite({ code, email: str(b.email, 200), name: str(b.name, 80), timeZone: str(b.timeZone, 64) });
    return NextResponse.json(out);
  } catch (e) {
    return fail(e);
  }
}
