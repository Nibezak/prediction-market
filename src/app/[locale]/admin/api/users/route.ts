import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { isAdminWallet } from '@/lib/admin'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { UserRepository } from '@/lib/db/queries/user'
import { buildPublicProfilePath, buildUsernameProfilePath } from '@/lib/platform-routing'
import resolveSiteUrl from '@/lib/site-url'
import { getPublicAssetUrl } from '@/lib/storage'
import { getUserPlatformRole, isStaffUser } from '@/lib/staff-role'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

function getApiUrl() {
  return process.env.NEXT_PUBLIC_SLIMEFISH_BACKEND_API_URL || 'http://localhost:8000/api'
}

function getServiceSecret() {
  return process.env.SLIMEFISH_BACKEND_SERVICE_API_KEY?.trim()
    || process.env.TELLWISE_SECRET?.trim()
    || ''
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await UserRepository.getCurrentUser({ minimal: true })
    if (!currentUser || !isStaffUser(currentUser)) {
      return NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    // Forward the query string exactly to the ledger backend.
    const apiUrl = new URL(`${getApiUrl()}/v1/admin/users`)
    apiUrl.search = searchParams.toString()

    const serviceSecret = getServiceSecret()
    if (!serviceSecret) {
      return NextResponse.json({ error: 'Slimefish ledger service credentials are not configured' }, { status: 503 })
    }

    const platformRole = getUserPlatformRole(currentUser)
    const hasBackendAdminAccess = platformRole === 'SUPER_ADMIN' || platformRole === 'ADMIN'
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-tellwise-secret': process.env.TELLWISE_SECRET?.trim() || serviceSecret,
      'x-tellwise-user-id': currentUser.id,
      'x-tellwise-role': platformRole,
      'x-tellwise-is-admin': hasBackendAdminAccess ? 'true' : 'false',
    }
    if (currentUser.email?.trim()) {
      headers['x-tellwise-user-email'] = currentUser.email.trim().toLowerCase()
    }

    const res = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: signSlimefishBackendRequest({ url: apiUrl, headers }),
    })

    if (!res.ok) {
      const payload = await res.json().catch(() => null) as { error?: string } | null
      return NextResponse.json(
        { error: payload?.error || 'Failed to fetch users from backend' },
        { status: res.status },
      )
    }

    const { data: usersData, count } = await res.json()

    // Fetch local Tellwise users to merge settings (like is_blocked)
    const userIds = (usersData ?? []).map((u: any) => u.id)
    const localUsersResult = await UserRepository.getUsersByIds(userIds)
    const localUsersMap = new Map((localUsersResult.data || []).map(u => [u.id, u]))

    // Assuming we don't have referredUsers fetched properly yet in the proxy, we skip it or fetch it.
    // For now, map ledger backend users to the admin UI expected format.
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

      const localUser = localUsersMap.get(user.id) as any
      const email = localUser?.email || user.email || ''
      const searchText = [
        user.username,
        email,
        user.address,
        depositWalletAddress,
        referredDisplay,
      ].filter(Boolean).join(' ').toLowerCase()

      const settings = localUser?.settings || {}
      const isBlocked = settings.is_blocked === 'true' || settings.is_blocked === true

      return {
        ...user,
        // Map ledger backend fields to UI fields where needed.
        address: user.address,
        email,
        image: user.avatarUrl,
        created_at: user.createdAt,
        deposit_wallet_address: user.depositWalletAddress,
        
        is_admin: user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || isAdminWallet(user.address),
        is_blocked: isBlocked,
        role: settings.staff_role || user.role || 'USER',
        settings,
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
