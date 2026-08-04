const HAS_PROTOCOL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i
const LOCAL_HOST_PATTERN = /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i

function normalizeSiteUrl(value: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('SITE_URL must be a non-empty string')
  }

  const trimmed = value.trim()
  const withProtocol = HAS_PROTOCOL_PATTERN.test(trimmed)
    ? trimmed
    : `${LOCAL_HOST_PATTERN.test(trimmed) ? 'http' : 'https'}://${trimmed}`

  let parsed
  try {
    parsed = new URL(withProtocol)
  }
  catch {
    throw new Error(`SITE_URL is not a valid URL: "${value}"`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('SITE_URL must start with http:// or https://')
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '')
  return `${parsed.protocol}//${parsed.host}${normalizedPath}${parsed.search}${parsed.hash}`
}

export default function resolveSiteUrl(env: NodeJS.ProcessEnv = process.env): string {
  const candidate = env.SITE_URL
    || env.NEXT_PUBLIC_SITE_URL
    || env.NEXT_PUBLIC_HOST_URL
    || env.RAILWAY_PUBLIC_DOMAIN
    || env.RAILWAY_STATIC_URL
    || env.VERCEL_PROJECT_PRODUCTION_URL

  if (typeof candidate === 'string' && candidate.trim()) {
    return normalizeSiteUrl(candidate)
  }

  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000'
  }

  return 'https://slimefish.com'
}
