import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyProviderWebhook } from '@/lib/payments/provider-webhook'

const SECRET_ENV = 'PAYMENT_WEBHOOK_SECRET_TEST_PROVIDER'
const originalSecret = process.env[SECRET_ENV]

afterEach(() => {
  if (originalSecret === undefined) delete process.env[SECRET_ENV]
  else process.env[SECRET_ENV] = originalSecret
})

function sign(rawBody: string, timestamp: string) {
  return createHmac('sha256', process.env[SECRET_ENV]!)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')
}

describe('provider webhook verification', () => {
  it('accepts an authentic signed payload', () => {
    process.env[SECRET_ENV] = 'test-secret'
    const rawBody = JSON.stringify({ id: 'evt_1', type: 'payment.succeeded' })
    const timestamp = String(Math.floor(Date.now() / 1000))

    expect(verifyProviderWebhook({
      provider: 'test-provider',
      rawBody,
      timestamp,
      signature: `sha256=${sign(rawBody, timestamp)}`,
    })).toEqual({
      payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      signatureDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })

  it('rejects a payload changed after signing', () => {
    process.env[SECRET_ENV] = 'test-secret'
    const originalBody = JSON.stringify({ amount: '10.00' })
    const timestamp = String(Math.floor(Date.now() / 1000))

    expect(() => verifyProviderWebhook({
      provider: 'test-provider',
      rawBody: JSON.stringify({ amount: '1000.00' }),
      timestamp,
      signature: sign(originalBody, timestamp),
    })).toThrow('Webhook signature is invalid.')
  })

  it('rejects a correctly signed replay outside the clock window', () => {
    process.env[SECRET_ENV] = 'test-secret'
    const rawBody = JSON.stringify({ id: 'evt_old' })
    const timestamp = String(Math.floor(Date.now() / 1000) - 301)

    expect(() => verifyProviderWebhook({
      provider: 'test-provider',
      rawBody,
      timestamp,
      signature: sign(rawBody, timestamp),
    })).toThrow('Webhook timestamp is outside the accepted window.')
  })
})
