import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json(
    { error: 'This wallet provider is no longer supported.' },
    { status: 410 },
  )
}

export const POST = GET
