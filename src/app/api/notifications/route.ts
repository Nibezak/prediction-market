import { NextResponse } from 'next/server'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { NotificationRepository } from '@/lib/db/queries/notification'
import { UserRepository } from '@/lib/db/queries/user'
import { enforceRateLimit } from '@/lib/security/rate-limit'

export async function GET() {
  try {
    const user = await UserRepository.getCurrentUser({ minimal: true })

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthenticated.' },
        { status: 401 },
      )
    }
    await enforceRateLimit({ scope: 'notifications-read', identifier: user.id, limit: 120, windowSeconds: 60 })

    const { data: notifications, error } = await NotificationRepository.getByUserId(user.id)

    if (error) {
      return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 500 })
    }

    return NextResponse.json(notifications)
  }
  catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 500 })
  }
}

export async function PATCH() {
  try {
    const user = await UserRepository.getCurrentUser({ minimal: true })

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthenticated.' },
        { status: 401 },
      )
    }
    await enforceRateLimit({ scope: 'notifications-write', identifier: user.id, limit: 30, windowSeconds: 60 })

    const { data, error } = await NotificationRepository.markAllReadByUserId(user.id)

    if (error) {
      return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 500 })
    }

    return NextResponse.json(data)
  }
  catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 500 })
  }
}
