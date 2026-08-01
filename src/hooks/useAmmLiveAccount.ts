'use client'

/* eslint-disable style/max-statements-per-line */
import { useCallback, useSyncExternalStore } from 'react'

export interface AmmLiveAccountSnapshot {
  userId?: string
  version: number
  balance: number
  positions: Array<{
    marketId: string
    optionId: string
    optionName?: string
    outcomeIndex?: number
    cost: number
    quantity: number
    value: number
  }>
}

interface AccountConnection {
  source: EventSource | null
  broadcast: BroadcastChannel | null
  leaseToken: string
  leaseTimer?: ReturnType<typeof setInterval>
  snapshot: AmmLiveAccountSnapshot | null
  closeTimer?: ReturnType<typeof setTimeout>
  listeners: Set<(snapshot: AmmLiveAccountSnapshot) => void>
}

const connections = new Map<string, AccountConnection>()
const LEASE_MS = 8_000
const LEASE_RENEW_MS = 3_000

function acceptSnapshot(userId: string, connection: AccountConnection, snapshot: AmmLiveAccountSnapshot) {
  if (snapshot.userId && snapshot.userId !== userId) { return }
  if (!connection.snapshot || snapshot.version > connection.snapshot.version) {
    connection.snapshot = snapshot
    connection.listeners.forEach(notify => notify(snapshot))
  }
}

function startSource(userId: string, connection: AccountConnection) {
  if (connection.source) { return }
  connection.source = new EventSource('/api/amm-live/account/stream')
  connection.source.addEventListener('account', ((event: MessageEvent<string>) => {
    try {
      const snapshot = JSON.parse(event.data) as AmmLiveAccountSnapshot
      acceptSnapshot(userId, connection, snapshot)
      connection.broadcast?.postMessage({ type: 'account', snapshot })
    }
    catch {}
  }) as EventListener)
}

function coordinateSource(userId: string, connection: AccountConnection) {
  const key = `slimefish:live:account:${userId}`
  const now = Date.now()
  let lease: { token?: string, expiresAt?: number } = {}
  try { lease = JSON.parse(localStorage.getItem(key) || '{}') as typeof lease }
  catch {}
  if (!lease.expiresAt || lease.expiresAt <= now || lease.token === connection.leaseToken) {
    localStorage.setItem(key, JSON.stringify({ token: connection.leaseToken, expiresAt: now + LEASE_MS }))
    startSource(userId, connection)
  }
  else if (connection.source) {
    connection.source.close()
    connection.source = null
  }
}

function getConnection(userId: string) {
  let connection = connections.get(userId)
  if (!connection) {
    const broadcast = typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel(`slimefish-account-${userId}`)
    connection = {
      source: null,
      broadcast,
      leaseToken: crypto.randomUUID(),
      snapshot: null,
      listeners: new Set(),
    }
    broadcast?.addEventListener('message', (event: MessageEvent<{ type?: string, snapshot?: AmmLiveAccountSnapshot }>) => {
      if (event.data?.type === 'account' && event.data.snapshot) { acceptSnapshot(userId, connection!, event.data.snapshot) }
    })
    coordinateSource(userId, connection)
    connection.leaseTimer = setInterval(() => coordinateSource(userId, connection!), LEASE_RENEW_MS)
    connections.set(userId, connection)
  }
  return connection
}

function subscribe(userId: string, listener: (snapshot: AmmLiveAccountSnapshot) => void) {
  const connection = getConnection(userId)
  if (connection.closeTimer) { clearTimeout(connection.closeTimer) }
  connection.listeners.add(listener)
  if (connection.snapshot) { listener(connection.snapshot) }
  coordinateSource(userId, connection)
  return () => {
    connection.listeners.delete(listener)
    if (connection.listeners.size === 0) {
      connection.closeTimer = setTimeout(() => {
        if (connection.listeners.size === 0) {
          connection.source?.close()
          connection.broadcast?.close()
          if (connection.leaseTimer) { clearInterval(connection.leaseTimer) }
          const key = `slimefish:live:account:${userId}`
          try {
            const lease = JSON.parse(localStorage.getItem(key) || '{}') as { token?: string }
            if (lease.token === connection.leaseToken) { localStorage.removeItem(key) }
          }
          catch {}
          connections.delete(userId)
        }
      }, 1_000)
    }
  }
}

export function useAmmLiveAccount(enabled = true, userId?: string | null) {
  const subscribeToAccount = useCallback((notify: () => void) => {
    if (!enabled || !userId) { return () => {} }
    return subscribe(userId, notify)
  }, [enabled, userId])
  const getSnapshot = useCallback(
    () => enabled && userId ? getConnection(userId).snapshot : null,
    [enabled, userId],
  )
  return useSyncExternalStore(subscribeToAccount, getSnapshot, () => null)
}
