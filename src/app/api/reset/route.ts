import { NextResponse } from 'next/server';
import { redeemReset } from '@/server/accounts';
import { body, fail, str } from '@/server/http';

export async function POST(req: Request) {
  try {
    return NextResponse.json(await redeemReset(str((await body(req)).code, 200)));
  } catch (e) {
    return fail(e);
  }
}
