import { Buffer } from 'node:buffer'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const KEY_LENGTH = 32

export function isValidWithdrawalPhonePin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4}$/.test(pin)
}

export async function hashWithdrawalPhonePin(pin: string) {
  if (!isValidWithdrawalPhonePin(pin)) {
    throw new Error('Passcode must contain exactly 4 digits.')
  }
  const salt = randomBytes(16)
  const derived = await scrypt(pin, salt, KEY_LENGTH) as Buffer
  return `scrypt-v1:${salt.toString('hex')}:${derived.toString('hex')}`
}

export async function verifyWithdrawalPhonePin(pin: string, encodedHash: string | null | undefined) {
  if (!isValidWithdrawalPhonePin(pin) || !encodedHash) {
    return false
  }
  const [version, saltHex, hashHex] = encodedHash.split(':')
  if (version !== 'scrypt-v1' || !saltHex || !hashHex) {
    return false
  }
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scrypt(pin, Buffer.from(saltHex, 'hex'), expected.length) as Buffer
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
