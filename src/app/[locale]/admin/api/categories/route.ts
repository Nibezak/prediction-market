import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { TagRepository } from '@/lib/db/queries/tag'
import { UserRepository } from '@/lib/db/queries/user'

export async function GET(request: NextRequest) {
  try {
    const currentUser = await UserRepository.getCurrentUser({ minimal: true })
    if (!currentUser || !currentUser.is_admin) {
      return NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const search = searchParams.get('search') || undefined
    const sortBy = (searchParams.get('sortBy') || 'display_order') as any
    const sortOrder = (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc'
    const mainOnly = searchParams.get('mainOnly') === '1'

    const { data, totalCount, error } = await TagRepository.listTags({
      limit,
      offset,
      search,
      sortBy,
      sortOrder,
      mainOnly,
    })

    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    return NextResponse.json({ data, totalCount })
  }
  catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      {
        error: DEFAULT_ERROR_MESSAGE,
        ...(process.env.NODE_ENV !== 'production'
          ? { detail: error instanceof Error ? error.message : String(error) }
          : {}),
      },
      { status: 500 },
    )
  }
}
