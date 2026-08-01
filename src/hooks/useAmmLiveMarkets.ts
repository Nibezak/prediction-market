'use client'

/* eslint-disable style/max-statements-per-line */
import { useMemo, useSyncExternalStore } from 'react'

export interface AmmLiveMarketSnapshot {
  marketId: string
  eventId: string
  status: 'active' | 'closed' | 'resolved' | 'canceled'
  version: number
  volume: number
  volume24h: number
  liquidity: number
  options: Array<{ id: string, name: string, color: string | null, probability: number }>
}

const snapshots = new Map<string, AmmLiveMarketSnapshot>()
const interests = new Map<string, number>()
const listeners = new Set<() => void>()
let revision = 0
let source: EventSource | null = null
let sourceSignature = ''
let restartTimer: ReturnType<typeof setTimeout> | null = null
let coordinationTimer: ReturnType<typeof setInterval> | null = null
let broadcast: BroadcastChannel | null = null
const tabToken = `market-${Date.now()}-${Math.random().toString(36).slice(2)}`
const LEADER_KEY = 'slimefish:live:markets:leader'
const INTEREST_PREFIX = 'slimefish:live:markets:interest:'
const LEASE_MS = 8_000
const LEASE_RENEW_MS = 3_000

function notify() {
  revision += 1
  listeners.forEach(listener => listener())
}

function accept(next: AmmLiveMarketSnapshot[]) {
  let changed = false
  for (const snapshot of next) {
    const current = snapshots.get(snapshot.marketId)
    if (!current || snapshot.version > current.version) {
      snapshots.set(snapshot.marketId, snapshot)
      changed = true
    }
  }
  if (changed) { notify() }
}

function localInterestIds() {
  return [...interests.entries()]
    .filter(([, count]) => count > 0)
    .map(([id]) => id)
    .sort()
}

function writeInterests(now = Date.now()) {
  if (typeof localStorage === 'undefined') { return }
  const key = `${INTEREST_PREFIX}${tabToken}`
  const ids = localInterestIds()
  if (ids.length === 0) {
    localStorage.removeItem(key)
  }
  else { localStorage.setItem(key, JSON.stringify({ ids, expiresAt: now + LEASE_MS })) }
}

function collectInterests(now = Date.now()) {
  const ids = new Set(localInterestIds())
  if (typeof localStorage === 'undefined') { return [...ids].sort() }
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith(INTEREST_PREFIX)) { continue }
    try {
      const entry = JSON.parse(localStorage.getItem(key) || '{}') as { ids?: string[], expiresAt?: number }
      if (!entry.expiresAt || entry.expiresAt <= now) {
        localStorage.removeItem(key)
        continue
      }
      entry.ids?.forEach(id => ids.add(id))
    }
    catch {
      localStorage.removeItem(key)
    }
  }
  return [...ids].sort()
}

function reconcileSource(ids = localInterestIds()) {
  const signature = ids.join(',')

  if (signature === sourceSignature) { return }
  source?.close()
  source = null
  sourceSignature = signature
  if (!signature) { return }

  const nextSource = new EventSource(`/api/amm-live/stream?ids=${encodeURIComponent(signature)}`)
  source = nextSource
  nextSource.addEventListener('snapshot', ((event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as { snapshots?: AmmLiveMarketSnapshot[] }
      const next = payload.snapshots ?? []
      accept(next)
      broadcast?.postMessage({ type: 'snapshots', snapshots: next })
    }
    catch {}
  }) as EventListener)
}

function coordinateSource() {
  if (typeof window === 'undefined') { return }
  const now = Date.now()
  writeInterests(now)
  let lease: { token?: string, expiresAt?: number } = {}
  try { lease = JSON.parse(localStorage.getItem(LEADER_KEY) || '{}') as typeof lease }
  catch {}
  const isLeader = !lease.expiresAt || lease.expiresAt <= now || lease.token === tabToken
  if (isLeader) {
    localStorage.setItem(LEADER_KEY, JSON.stringify({ token: tabToken, expiresAt: now + LEASE_MS }))
    reconcileSource(collectInterests(now))
  }
  else if (source) {
    source.close()
    source = null
    sourceSignature = ''
  }
}

function ensureCoordination() {
  if (typeof window === 'undefined') { return }
  if (!broadcast && typeof BroadcastChannel !== 'undefined') {
    broadcast = new BroadcastChannel('slimefish-market-live')
    broadcast.addEventListener('message', (event: MessageEvent<{ type?: string, snapshots?: AmmLiveMarketSnapshot[] }>) => {
      if (event.data?.type === 'snapshots') { accept(event.data.snapshots ?? []) }
      if (event.data?.type === 'interest') { coordinateSource() }
    })
  }
  if (!coordinationTimer) { coordinationTimer = setInterval(coordinateSource, LEASE_RENEW_MS) }
}

function scheduleReconcile() {
  if (restartTimer) { clearTimeout(restartTimer) }
  restartTimer = setTimeout(() => {
    restartTimer = null
    ensureCoordination()
    coordinateSource()
  }, 50)
}

function subscribe(marketIds: string[], listener: () => void) {
  listeners.add(listener)
  for (const id of marketIds) { interests.set(id, (interests.get(id) ?? 0) + 1) }
  writeInterests()
  scheduleReconcile()
  broadcast?.postMessage({ type: 'interest' })

  return () => {
    listeners.delete(listener)
    for (const id of marketIds) {
      const count = Math.max(0, (interests.get(id) ?? 1) - 1)
      if (count === 0) {
        interests.delete(id)
      }
      else { interests.set(id, count) }
    }
    writeInterests()
    scheduleReconcile()
    broadcast?.postMessage({ type: 'interest' })
  }
}

export function useAmmLiveMarkets(marketIds: string[], enabled = true) {
  const signature = useMemo(
    () => [...new Set(marketIds.filter(Boolean))].sort().join(','),
    [marketIds],
  )
  const ids = useMemo(() => signature.split(',').filter(Boolean), [signature])
  const subscribeToMarkets = useMemo(
    () => (listener: () => void) => enabled && ids.length > 0
      ? subscribe(ids, listener)
      : () => {},
    [enabled, ids],
  )
  useSyncExternalStore(subscribeToMarkets, () => revision, () => revision)

  const result: Record<string, AmmLiveMarketSnapshot> = {}
  for (const id of ids) {
    const snapshot = snapshots.get(id)
    if (snapshot) { result[id] = snapshot }
  }
  return result
}
