'use client'

import { useEffect } from 'react'
import BrandedErrorState from '@/components/BrandedErrorState'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  useEffect(() => {
    console.error('Page render failed', error)
  }, [error])
  return <BrandedErrorState code="500" title="Something did not load" description="Your account is safe. Try the page again, or return home while we reconnect." retry={reset} />
}
