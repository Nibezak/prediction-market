import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { isAdminWallet } from '@/lib/admin'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { UserRepository } from '@/lib/db/queries/user'
import { buildPublicProfilePath, buildUsernameProfilePath } from '@/lib/platform-routing'
import resolveSiteUrl from '@/lib/site-url'
import { getPublicAssetUrl } from '@/lib/storage'
import { getUserPlatformRole, isStaffUser } from '@/lib/staff-role'

function getApiUrl() {
  return process.env.NEXT_PUBLIC_PLAY_MONEY_API_URL || 'http://localhost:8000/api'
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await UserRepository.getCurrentUser({ minimal: true })
    if (!currentUser || !isStaffUser(currentUser)) {
      return NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    // Forward the query string exactly to Play-Money
    const apiUrl = new URL(`${getApiUrl()}/v1/admin/users`)
    apiUrl.search = searchParams.toString()

    const res = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-tellwise-secret': process.env.TELLWISE_SECRET || 'tellwise_super_secret_bypass_key_123',
        'x-tellwise-user-id': currentUser.id,
        'x-tellwise-role': getUserPlatformRole(currentUser),
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch users from backend' }, { status: 500 })
    }

    const { data: usersData, count } = await res.json()

    // Fetch local Tellwise users to merge settings (like is_blocked)
    const userIds = (usersData ?? []).map((u: any) => u.id)
    const localUsersResult = await UserRepository.getUsersByIds(userIds)
    const localUsersMap = new Map((localUsersResult.data || []).map(u => [u.id, u]))

    // Assuming we don't have referredUsers fetched properly yet in the proxy, we skip it or fetch it.
    // For now, map Play-Money User to Tellwise UI expected format.
    const baseProfileUrl = resolveSiteUrl(process.env)

    const transformedUsers = (usersData ?? []).map((user: any) => {
      const created = new Date(user.createdAt)
      const createdLabel = Number.isNaN(created.getTime())
        ? '—'
        : created.toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric',
          })

      const depositWalletAddress = user.depositWalletAddress
      const profilePath = buildPublicProfilePath(user.username || depositWalletAddress || user.address || '')

      let referredDisplay: string | null = null
      let referredProfile: string | null = null

      if (user.referredBy) {
        // We'd ideally fetch the referred user details, but keeping it simple for now
        referredDisplay = user.referredBy 
      }

      const searchText = [
        user.username,
        user.email,
        user.address,
        depositWalletAddress,
        referredDisplay,
      ].filter(Boolean).join(' ').toLowerCase()

      const localUser = localUsersMap.get(user.id) as any
      const settings = localUser?.settings || {}
      const isBlocked = settings.is_blocked === 'true' || settings.is_blocked === true

      return {
        ...user,
        // Map Play-Money fields to Tellwise fields where needed
        address: user.address,
        email: user.email,
        image: user.avatarUrl,
        created_at: user.createdAt,
        deposit_wallet_address: user.depositWalletAddress,
        
        is_admin: user.role === 'ADMIN' || isAdminWallet(user.address),
        is_blocked: isBlocked,
        avatarUrl: user.avatarUrl ? getPublicAssetUrl(user.avatarUrl) : '',
        referred_by_display: referredDisplay,
        referred_by_profile_url: referredProfile,
        created_label: createdLabel,
        profileUrl: profilePath ? `${baseProfileUrl}${profilePath}` : null,
        search_text: searchText,
      }
    })

    return NextResponse.json({
      data: transformedUsers,
      count: count || 0,
      totalCount: count || 0,
    })
  }
  catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 500 })
  }
}
