import resolveSiteUrl from '@/lib/site-url'

interface KotaniPayResponse<T> {
  success: boolean
  message: string
  data: T
}

interface OnrampRateData {
  from: string
  to: string
  value: string
  id: string
  fiatAmount: number
  cryptoAmount: number
  transactionAmount: number
  fee: number
}

interface OnrampData {
  id: string
  referenceId: string
  referenceNumber: number
  message: string
  customerKey: string
  redirectUrl?: string
}

function getKotaniPayBaseUrl() {
  const configured = process.env.KOTANI_PAY_SANDBOX_URL?.trim() || 'https://sandbox-api.kotanipay.io'
  return configured.replace(/\/api\/v3\/?$/, '')
}

function getKotaniPayApiKey() {
  const apiKey = process.env.KOTANI_PAY_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('Kotani Pay is not configured. Set KOTANI_PAY_API_KEY in your environment.')
  }
  return apiKey
}

function getKotaniPayChain() {
  const chain = process.env.KOTANI_PAY_CHAIN?.trim().toUpperCase()
  return chain || 'POLYGON'
}

async function kotaniPayRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${getKotaniPayBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${getKotaniPayApiKey()}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  const payload = await response.json().catch(() => null) as KotaniPayResponse<T> | null

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || `Kotani Pay request failed (${response.status})`)
  }

  return payload.data
}

export async function getKotaniOnrampRate(params: {
  fiatAmount: number
  fiatCurrency?: string
  cryptoCurrency?: string
}) {
  return kotaniPayRequest<OnrampRateData>('/api/v3/rate/onramp', {
    method: 'POST',
    body: JSON.stringify({
      from: params.fiatCurrency || 'KES',
      to: params.cryptoCurrency || 'USDC',
      fiatAmount: params.fiatAmount,
    }),
  })
}

export async function ensureKotaniMobileMoneyCustomer(params: {
  phoneNumber: string
  accountName?: string
}) {
  try {
    return await kotaniPayRequest<{ customer_key?: string }>('/api/v3/customer/mobile-money', {
      method: 'POST',
      body: JSON.stringify({
        phone_number: params.phoneNumber,
        country_code: 'KE',
        network: 'MPESA',
        account_name: params.accountName || 'Tellwise User',
      }),
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    if (message.includes('already') || message.includes('exist')) {
      return null
    }
    throw error
  }
}

export async function createKotaniOnramp(params: {
  phoneNumber: string
  fiatAmount: number
  walletAddress: string
  rateId: string
  referenceId: string
  fiatCurrency?: string
  cryptoCurrency?: string
  accountName?: string
}) {
  await ensureKotaniMobileMoneyCustomer({
    phoneNumber: params.phoneNumber,
    accountName: params.accountName,
  })

  const siteUrl = resolveSiteUrl(process.env)

  return kotaniPayRequest<OnrampData>('/api/v3/onramp', {
    method: 'POST',
    body: JSON.stringify({
      mobileMoney: {
        phoneNumber: params.phoneNumber,
        accountName: params.accountName || 'Tellwise User',
        providerNetwork: 'MPESA',
      },
      fiatAmount: params.fiatAmount,
      currency: params.fiatCurrency || 'KES',
      chain: getKotaniPayChain(),
      token: params.cryptoCurrency || 'USDC',
      receiverAddress: params.walletAddress,
      referenceId: params.referenceId,
      callbackUrl: `${siteUrl}/api/kotani-webhook`,
      rateId: params.rateId,
    }),
  })
}
