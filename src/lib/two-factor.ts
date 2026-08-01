import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import 'server-only'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const TOTP_PERIOD_SECONDS = 30
const TOTP_DIGITS = 6

function encryptionKey() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim() || process.env.TELLWISE_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new Error('A 32-character authentication secret is required for 2FA encryption.')
  }
  return createHash('sha256').update(secret).digest()
}

function encodeBase32(buffer: Buffer) {
  let bits = ''
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0')
  let output = ''
  for (let index = 0; index < bits.length; index += 5) {
    output += BASE32_ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)]
  }
  return output
}

function decodeBase32(value: string) {
  const normalized = value.toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '')
  let bits = ''
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character)
    if (index < 0) throw new Error('Invalid TOTP secret.')
    bits += index.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2))
  }
  return Buffer.from(bytes)
}

export function generateTotpSecret() {
  return encodeBase32(randomBytes(20))
}

export function encryptTotpSecret(secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`
}

export function decryptTotpSecret(value: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split(':')
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
    throw new Error('Stored 2FA secret is invalid.')
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

function totpAt(secret: string, counter: number) {
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const binary = ((digest[offset]! & 0x7f) << 24)
    | ((digest[offset + 1]! & 0xff) << 16)
    | ((digest[offset + 2]! & 0xff) << 8)
    | (digest[offset + 3]! & 0xff)
  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, '0')
}

export function verifyTotpCode(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false
  const counter = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS)
  const supplied = Buffer.from(code)
  for (const drift of [-1, 0, 1]) {
    const expected = Buffer.from(totpAt(secret, counter + drift))
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return true
  }
  return false
}

export function createTotpUri({ secret, email, issuer }: { secret: string, email: string, issuer: string }) {
  const label = `${issuer}:${email}`
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(TOTP_DIGITS), period: String(TOTP_PERIOD_SECONDS) })
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`
}

export function generateBackupCodes(count = 8) {
  return Array.from({ length: count }, () => randomBytes(5).toString('hex').toUpperCase())
}

export function hashBackupCodes(codes: string[]) {
  return JSON.stringify(codes.map(code => createHash('sha256').update(code).digest('hex')))
}
