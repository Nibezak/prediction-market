import type { Instrumentation } from 'next'
import { isNextNotFoundError } from '@/lib/next-http-fallback'

export async function register() {
  if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    await import('../sentry.server.config')
  }
}

export async function onRequestError(
  error: Parameters<Instrumentation.onRequestError>[0],
  request: Parameters<Instrumentation.onRequestError>[1],
  context: Parameters<Instrumentation.onRequestError>[2],
) {
  if (isNextNotFoundError(error)) {
    return
  }

  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(error, request, context)
}
