'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function AdminLiveRefresh() {
  const router = useRouter()
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 15_000)
    return () => window.clearInterval(interval)
  }, [router])

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="This view refreshes every 15 seconds while visible">
      <span className="size-1.5 rounded-full bg-yes" />Live
    </span>
  )
}
