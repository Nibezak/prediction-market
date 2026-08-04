import { NextResponse } from 'next/server'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { fetchTopHoldersFromDataApi } from '@/lib/data-api/holders'
import { UserRepository } from '@/lib/db/queries/user'
import { slimefishBackendFetch } from '@/lib/slimefish-backend-auth'
import { getPublicAssetUrl } from '@/lib/storage'
import { normalizeAddress } from '@/lib/wallet'

interface HolderUser {
  id: string
  username: string
  deposit_wallet_address?: string | null
  image: string
  created_at?: string
}

interface Holder {
  user: HolderUser
  net_position: string
  outcome_index: number
  outcome_text: string
}

function normalizeAddressKey(address?: string | null) {
  const normalized = normalizeAddress(address)?.toLowerCase()
  return normalized || null
}

function normalizeAvatarUrl(image: string | null | undefined) {
  if (!image) {
    return ''
  }

  if (image.startsWith('http')) {
    return image
  }

  return getPublicAssetUrl(image)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const conditionId = searchParams.get('conditionId') || searchParams.get('market')
  const yesToken = searchParams.get('yesToken') || undefined
  const noToken = searchParams.get('noToken') || undefined

  const parsedLimit = Number.parseInt(searchParams.get('limit') || '50', 10)
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 50, 1), 500)

  if (!conditionId) {
    return NextResponse.json({ error: 'Missing conditionId.' }, { status: 400 })
  }

  try {
    if (process.env.NEXT_PUBLIC_USE_SLIMEFISH_BACKEND_AMM !== 'false') {
      const ammBaseUrl = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
      const response = await slimefishBackendFetch(`${ammBaseUrl}/markets/${conditionId}/positions?status=active&limit=${limit}`)
      if (!response.ok) {
        throw new Error('Failed to load AMM positions.')
      }
      const payload = await response.json() as { data?: any[] }
      const yesHolders: Holder[] = []
      const noHolders: Holder[] = []

      for (const position of payload.data ?? []) {
        const quantity = Number(position.quantity ?? 0)
        if (!Number.isFinite(quantity) || quantity <= 0) {
          continue
        }
        const user = position.account?.user ?? {}
        const optionName = String(position.option?.name || '').trim().toLowerCase()
        const outcomeIndex = position.optionId === noToken || optionName === 'no' ? 1 : 0
        const holder: Holder = {
          user: {
            id: user.id || position.accountId,
            username: user.username || user.displayName || 'Trader',
            deposit_wallet_address: null,
            image: normalizeAvatarUrl(user.avatarUrl),
            created_at: user.createdAt,
          },
          net_position: quantity.toString(),
          outcome_index: outcomeIndex,
          outcome_text: position.option?.name || (outcomeIndex === 0 ? 'Yes' : 'No'),
        }
        ;(outcomeIndex === 0 ? yesHolders : noHolders).push(holder)
      }

      return NextResponse.json({ yesHolders, noHolders })
    }

    const base = await fetchTopHoldersFromDataApi(conditionId, limit, { yesToken, noToken })

    const addressSet = new Set<string>()
    function collectAddresses(holders: Holder[]) {
      holders.forEach(({ user }) => {
        const depositWallet = normalizeAddressKey(user.deposit_wallet_address)

        if (depositWallet) {
          addressSet.add(depositWallet)
        }
      })
    }

    collectAddresses(base.yesHolders)
    collectAddresses(base.noHolders)

    const profileLookup = new Map<string, HolderUser>()

    if (addressSet.size > 0) {
      const { data: profiles, error } = await UserRepository.getUsersByAddresses(Array.from(addressSet))

      if (error) {
        console.error('Failed to load holder profiles', error)
      }

      for (const profile of profiles || []) {
        const fallbackAddress = profile.deposit_wallet_address ?? profile.address
        const normalizedAddress = normalizeAddressKey(profile.address)
        const normalizedDepositWalletAddress = normalizeAddressKey(profile.deposit_wallet_address)
        const imageUrl = normalizeAvatarUrl(profile.image)
        const createdAt = profile.created_at
          ? new Date(profile.created_at).toISOString()
          : undefined
        const profileData: HolderUser = {
          id: profile.id,
          username: profile.username || fallbackAddress,
          deposit_wallet_address: profile.deposit_wallet_address ?? null,
          image: imageUrl,
          created_at: createdAt,
        }

        if (normalizedAddress) {
          profileLookup.set(normalizedAddress, profileData)
        }
        if (normalizedDepositWalletAddress) {
          profileLookup.set(normalizedDepositWalletAddress, profileData)
        }
      }
    }

    function hydrateHolders(holders: Holder[]) {
      return holders.map((holder) => {
        const lookupKeys = [
          normalizeAddressKey(holder.user.deposit_wallet_address),
        ].filter(Boolean) as string[]

        const matchedProfile = lookupKeys
          .map(key => profileLookup.get(key))
          .find(Boolean)

        return {
          ...holder,
          user: {
            ...holder.user,
            id: matchedProfile?.id ?? holder.user.id,
            username: holder.user.username || matchedProfile?.username,
            deposit_wallet_address: matchedProfile?.deposit_wallet_address ?? holder.user.deposit_wallet_address,
            image: normalizeAvatarUrl(holder.user.image || matchedProfile?.image),
            created_at: matchedProfile?.created_at ?? holder.user.created_at,
          },
        }
      })
    }

    return NextResponse.json({
      yesHolders: hydrateHolders(base.yesHolders),
      noHolders: hydrateHolders(base.noHolders),
    })
  }
  catch (error) {
    console.error('Failed to load holders', error)
    return NextResponse.json({ error: DEFAULT_ERROR_MESSAGE }, { status: 500 })
  }
}
