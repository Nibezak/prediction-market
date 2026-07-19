'use client'

import { LoaderCircleIcon, RotateCwIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const REFRESH_THRESHOLD = 72

export default function PullToRefresh() {
  const router = useRouter()
  const startY = useRef<number | null>(null)
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  function reset() {
    startY.current = null
    setDistance(0)
  }

  return (
    <div
      className="fixed inset-x-0 top-16 z-40 md:hidden"
      onTouchStart={(event) => {
        if (window.scrollY <= 0 && !refreshing) {
          startY.current = event.touches[0]?.clientY ?? null
        }
      }}
      onTouchMove={(event) => {
        if (startY.current == null || window.scrollY > 0) return
        const nextDistance = Math.max(0, Math.min(96, (event.touches[0]?.clientY ?? startY.current) - startY.current))
        setDistance(nextDistance)
      }}
      onTouchCancel={reset}
      onTouchEnd={() => {
        if (distance < REFRESH_THRESHOLD) {
          reset()
          return
        }
        setRefreshing(true)
        setDistance(REFRESH_THRESHOLD)
        router.refresh()
        window.setTimeout(() => {
          setRefreshing(false)
          reset()
        }, 900)
      }}
      style={{ height: distance ? `${distance}px` : '16px' }}
    >
      <div
        className={cn(
          'mx-auto mt-2 flex size-9 items-center justify-center rounded-full border bg-background shadow-sm transition-opacity',
          distance > 8 ? 'opacity-100' : 'opacity-0',
        )}
      >
        {refreshing
          ? <LoaderCircleIcon className="size-4 animate-spin" />
          : <RotateCwIcon className={cn('size-4', distance >= REFRESH_THRESHOLD && 'text-primary')} />}
      </div>
    </div>
  )
}
