import { createHash, createHmac } from 'node:crypto'
import 'server-only'

const DEFAULT_SOURCE_URL = process.env.SLIMEFISH_FRONTEND_URL
  || process.env.NEXT_PUBLIC_APP_URL
  || process.env.APP_URL
  || 'http://localhost:3000'

export function getSlimefishBackendServiceKey() {
  return process.env.SLIMEFISH_BACKEND_SERVICE_API_KEY?.trim()
    || process.env.TELLWISE_SECRET?.trim()
    || ''
}

export function getSlimefishBackendBaseUrl() {
  return process.env.AMM_BASE_URL?.trim()
    || `${process.env.NEXT_PUBLIC_SLIMEFISH_BACKEND_API_URL?.trim() || 'http://localhost:8000/api'}/v1`
}

function getSlimefishBackendSigningSecret() {
  return process.env.SLIMEFISH_BACKEND_REQUEST_PRIVATE_KEY?.trim()
    || process.env.SLIMEFISH_BACKEND_REQUEST_SIGNING_SECRET?.trim()
    || process.env.TELLWISE_SERVICE_PRIVATE_KEY?.trim()
    || ''
}

function bodyHash(body: BodyInit | null | undefined) {
  if (typeof body === 'string') {
    return createHash('sha256').update(body).digest('hex')
  }
  if (!body) {
    return createHash('sha256').update('').digest('hex')
  }
  throw new Error('Signed Slimefish backend requests must use string bodies.')
}

export function signSlimefishBackendRequest(input: {
  url: string | URL
  method?: string
  body?: BodyInit | null
  headers?: HeadersInit
  sourceUrl?: string
}) {
  const url = new URL(String(input.url))
  const method = (input.method || 'GET').toUpperCase()
  const timestamp = String(Math.floor(Date.now() / 1000))
  const hash = bodyHash(input.body)
  const sourceUrl = input.sourceUrl || DEFAULT_SOURCE_URL
  const serviceKey = getSlimefishBackendServiceKey()
  const signingSecret = getSlimefishBackendSigningSecret()
  if (!serviceKey) {
    throw new Error('Slimefish backend service key is not configured.')
  }

  const headers = new Headers(input.headers)
  headers.set('x-slimefish-backend-api-key', serviceKey)
  headers.set('x-slimefish-source-url', sourceUrl)
  headers.set('x-slimefish-request-timestamp', timestamp)
  headers.set('x-slimefish-body-sha256', hash)
  if (signingSecret) {
    const pathWithSearch = `${url.pathname}${url.search}`
    const payload = [method, pathWithSearch, timestamp, hash, sourceUrl].join('\n')
    const signature = createHmac('sha256', signingSecret).update(payload).digest('hex')
    headers.set('x-slimefish-request-signature', signature)
  }
  return headers
}

export function slimefishBackendFetch(
  url: string | URL,
  init: RequestInit & { body?: string | null } = {},
) {
  const method = init.method || 'GET'
  return fetch(url, {
    ...init,
    headers: signSlimefishBackendRequest({
      url,
      method,
      body: typeof init.body === 'string' ? init.body : null,
      headers: init.headers,
    }),
  })
}
