import { createHmac, timingSafeEqual } from 'node:crypto'

export const MIRROR_COOKIE_NAME = 'slimefish_staff_mirror'
export const MIRROR_MAX_AGE_SECONDS = 15 * 60

function secret() {
  return process.env.BETTER_AUTH_SECRET?.trim() || ''
}

function sign(payload: string) {
  const value = secret()
  return value ? createHmac('sha256', value).update(payload).digest('hex') : ''
}

export function createMirrorCookie(actorUserId: string, targetUserId: string) {
  const expiresAt = Date.now() + MIRROR_MAX_AGE_SECONDS * 1000
  const payload = `${actorUserId}.${targetUserId}.${expiresAt}`
  const signature = sign(payload)
  return signature ? `${payload}.${signature}` : ''
}

export function verifyMirrorCookie(value: string | undefined, actorUserId: string) {
  if (!value) return null
  const [actor, target, expiresRaw, signature] = value.split('.')
  const expiresAt = Number(expiresRaw)
  if (!actor || !target || !signature || actor !== actorUserId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null
  const expected = sign(`${actor}.${target}.${expiresRaw}`)
  if (!expected || expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null
  return { actorUserId: actor, targetUserId: target, expiresAt }
}

export function readCookie(header: string | null, name: string) {
  return header?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1)
}
