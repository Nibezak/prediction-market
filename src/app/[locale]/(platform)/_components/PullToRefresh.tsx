'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const REFRESH_THRESHOLD = 72
const MAX_PULL_DISTANCE = 112
const MIN_TRACK_START_Y = 36

function RefreshLoader({ progress, refreshing }: { progress: number, refreshing: boolean }) {
  const normalized = Math.max(0, Math.min(1, progress))

  return (
    <div className="relative flex h-11 w-28 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-background/95 shadow-lg shadow-black/10 backdrop-blur-md">
      <div className="relative flex items-end gap-1.5">
        {[0, 1, 2, 3, 4].map(index => (
          <span
            key={index}
            className={cn(
              'block w-1.5 rounded-full bg-primary/35 transition-all duration-200',
              refreshing ? 'animate-pull-refresh-wave bg-primary' : normalized > index / 5 && 'bg-primary',
            )}
            style={{
              height: `${10 + (index % 3) * 5}px`,
              animationDelay: `${index * 90}ms`,
              transform: refreshing ? undefined : `translateY(${(1 - normalized) * 4}px)`,
              opacity: refreshing ? 1 : 0.35 + normalized * 0.65,
            }}
          />
        ))}
      </div>
    </div>
  )
}

export default function PullToRefresh() {
  const router = useRouter()
  const startY = useRef<number | null>(null)
  const isTracking = useRef(false)
  const hasThresholdHapticFired = useRef(false)
  const distanceRef = useRef(0)
  const refreshingRef = useRef(false)
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  function vibrate(pattern: VibratePattern) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern)
    }
  }

  function reset() {
    startY.current = null
    isTracking.current = false
    hasThresholdHapticFired.current = false
    distanceRef.current = 0
    setDistance(0)
  }

  function setTrackedDistance(nextDistance: number) {
    distanceRef.current = nextDistance
    setDistance(nextDistance)
  }

  function startRefresh() {
    setRefreshing(true)
    refreshingRef.current = true
    vibrate([12, 24, 12])
    setTrackedDistance(REFRESH_THRESHOLD)
    router.refresh()
    window.setTimeout(() => {
      setRefreshing(false)
      refreshingRef.current = false
      reset()
    }, 900)
  }

  useEffect(function bindPullToRefreshTouchListeners() {
    function handleTouchStart(event: TouchEvent) {
      const touch = event.touches[0]
      if (window.scrollY <= 0 && !refreshingRef.current && touch && touch.clientY >= MIN_TRACK_START_Y) {
        startY.current = touch.clientY
        isTracking.current = true
      }
    }

    function handleTouchMove(event: TouchEvent) {
      if (!isTracking.current || startY.current == null || window.scrollY > 0) return
      const touch = event.touches[0]
      if (!touch) return
      const nextDistance = Math.max(0, Math.min(MAX_PULL_DISTANCE, touch.clientY - startY.current))
      if (nextDistance > 8) {
        event.preventDefault()
      }
      if (nextDistance >= REFRESH_THRESHOLD && !hasThresholdHapticFired.current) {
        hasThresholdHapticFired.current = true
        vibrate(10)
      }
      if (nextDistance < REFRESH_THRESHOLD * 0.7) {
        hasThresholdHapticFired.current = false
      }
      setTrackedDistance(nextDistance)
    }

    function handleTouchEnd() {
      if (!isTracking.current) return
      if (distanceRef.current < REFRESH_THRESHOLD) {
        reset()
        return
      }
      startRefresh()
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchcancel', reset, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })

    return function cleanupPullToRefreshTouchListeners() {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchcancel', reset)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [])

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-28 z-40 md:hidden"
      style={{ height: distance || refreshing ? `${Math.max(distance, REFRESH_THRESHOLD)}px` : '18px' }}
    >
      <div
        className={cn(
          'mx-auto mt-2 flex justify-center transition-all duration-200',
          distance > 8 ? 'opacity-100' : 'opacity-0',
        )}
        style={{
          transform: `translateY(${Math.max(0, Math.min(18, distance / 7))}px)`,
        }}
      >
        <RefreshLoader progress={distance / REFRESH_THRESHOLD} refreshing={refreshing} />
      </div>
    </div>
  )
}
