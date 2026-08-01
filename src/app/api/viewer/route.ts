import { NextResponse } from 'next/server'
import { UserRepository } from '@/lib/db/queries/user'

export async function GET() {
  const user = await UserRepository.getCurrentUser({
    disableCookieCache: true,
    minimal: true,
  })

  return NextResponse.json(
    { user },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
