import { createHash } from 'node:crypto'

function cleanHeader(value: string | null) {
  return (value || '').trim().slice(0, 512)
}

export function getClientNetworkIdentity(headers: Headers) {
  const forwarded = cleanHeader(headers.get('x-forwarded-for')).split(',')[0]?.trim()
  const ip = cleanHeader(headers.get('cf-connecting-ip'))
    || cleanHeader(headers.get('x-real-ip'))
    || forwarded
    || 'unknown'
  const userAgent = cleanHeader(headers.get('user-agent')) || 'unknown'
  const language = cleanHeader(headers.get('accept-language')) || 'unknown'
  const fingerprint = createHash('sha256')
    .update(`${ip}\n${userAgent}\n${language}`)
    .digest('hex')
  return { ip: ip.slice(0, 128), fingerprint }
}
