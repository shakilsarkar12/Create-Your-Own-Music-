import { NextResponse } from 'next/server';

export async function GET() {
  const hasServerKey = !!process.env.SUNO_API_KEY;
  return NextResponse.json({ hasServerKey });
}
