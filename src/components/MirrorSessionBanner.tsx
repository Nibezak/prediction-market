'use client'

import { XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

export default function MirrorSessionBanner() {
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    void fetch('/api/admin/mirror', { cache: 'no-store' }).then(response => response.json()).then(data => setEmail(data?.active ? data.target?.email || 'User' : null)).catch(() => undefined)
  }, [])
  if (!email) return null
  return (
    <div className="sticky top-0 z-[100] flex min-h-10 items-center justify-center gap-3 bg-zinc-700 px-4 py-2 text-sm font-medium text-white">
      <span>{email}: mirroring</span>
      <Button size="icon" variant="ghost" className="size-7 text-white hover:bg-white/15 hover:text-white" aria-label="Stop mirroring" onClick={() => void fetch('/api/admin/mirror', { method: 'DELETE' }).finally(() => window.location.assign('/'))}>
        <XIcon className="size-4" />
      </Button>
    </div>
  )
}
