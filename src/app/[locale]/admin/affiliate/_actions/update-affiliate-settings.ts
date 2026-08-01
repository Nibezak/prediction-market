'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  AFFILIATE_SETTINGS_GROUP,
  AFFILIATE_SHARE_BPS_KEY,
  BUILDER_MAKER_FEE_BPS_KEY,
  BUILDER_TAKER_FEE_BPS_KEY,
} from '@/lib/affiliate-fee-settings'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { SettingsRepository } from '@/lib/db/queries/settings'
import { UserRepository } from '@/lib/db/queries/user'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

export interface ForkSettingsActionState {
  error: string | null
}

function parsePercent(value: unknown) {
  return typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
}

const UpdateFeeSettingsSchema = z.object({
  amm_trade_fee_percent: z.preprocess(parsePercent, z.number().min(0).max(9)),
  affiliate_share_percent: z.preprocess(parsePercent, z.number().min(0).max(100)),
})

function getSlimefishBackendSettingsUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_SLIMEFISH_BACKEND_API_URL || 'http://localhost:8000/api'
  return `${baseUrl.replace(/\/$/, '')}/v1/settings`
}

async function syncSlimefishBackendTradeFee(userId: string, tradeFeeBps: number) {
  const serviceSecret = process.env.SLIMEFISH_BACKEND_SERVICE_API_KEY?.trim()
    || process.env.TELLWISE_SECRET?.trim()
    || ''
  if (!serviceSecret) {
    throw new Error('Slimefish ledger service credentials are not configured.')
  }

  const url = getSlimefishBackendSettingsUrl()
  const body = JSON.stringify({
    settings: [{ group: 'fees', key: 'amm_trade_fee_bps', value: tradeFeeBps.toString() }],
  })
  const response = await fetch(url, {
    method: 'POST',
    headers: signSlimefishBackendRequest({ url, method: 'POST', body, headers: {
      'Content-Type': 'application/json',
      'x-tellwise-secret': process.env.TELLWISE_SECRET?.trim() || serviceSecret,
      'x-tellwise-user-id': userId,
      'x-tellwise-role': 'ADMIN',
    } }),
    body,
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(payload?.error || 'Could not update the trade engine fee.')
  }
}

export async function updateForkSettingsAction(
  _prevState: ForkSettingsActionState,
  formData: FormData,
): Promise<ForkSettingsActionState> {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user || !user.is_admin) {
    return { error: 'Unauthenticated.' }
  }

  const parsed = UpdateFeeSettingsSchema.safeParse({
    amm_trade_fee_percent: formData.get('amm_trade_fee_percent'),
    affiliate_share_percent: formData.get('affiliate_share_percent'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const tradeFeeBps = Math.round(parsed.data.amm_trade_fee_percent * 100)
  const affiliateShareBps = Math.round(parsed.data.affiliate_share_percent * 100)

  try {
    await syncSlimefishBackendTradeFee(user.id, tradeFeeBps)
    const { error } = await SettingsRepository.updateSettings([
      { group: AFFILIATE_SETTINGS_GROUP, key: BUILDER_TAKER_FEE_BPS_KEY, value: tradeFeeBps.toString() },
      { group: AFFILIATE_SETTINGS_GROUP, key: BUILDER_MAKER_FEE_BPS_KEY, value: '0' },
      { group: AFFILIATE_SETTINGS_GROUP, key: AFFILIATE_SHARE_BPS_KEY, value: affiliateShareBps.toString() },
    ])
    if (error) {
      return { error: DEFAULT_ERROR_MESSAGE }
    }
  }
  catch (error) {
    console.error('Failed to update AMM fee settings', error)
    return { error: error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE }
  }

  revalidatePath('/admin/affiliate')
  return { error: null }
}
