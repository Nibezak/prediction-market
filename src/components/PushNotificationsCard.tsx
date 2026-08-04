'use client'

import { BellRingIcon, CheckIcon, Loader2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

function decodeVapidKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)))
}

function detectPlatform() {
  const agent = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(agent)) return 'ios'
  if (/android/.test(agent)) return 'android'
  return 'desktop'
}

function isStandalonePwa() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export default function PushNotificationsCard() {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [supported, setSupported] = useState(true)
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false)

  useEffect(() => {
    const available = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    setSupported(available)
    setIosNeedsInstall(detectPlatform() === 'ios' && !isStandalonePwa())
    if (!available) return
    void navigator.serviceWorker.getRegistration('/').then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription()
      setEnabled(Boolean(subscription) && Notification.permission === 'granted')
    })
  }, [])

  async function enablePush() {
    const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim()
    if (!publicKey) throw new Error('Push notifications are not configured yet.')
    if (iosNeedsInstall) throw new Error('Add Slimefish to your Home Screen, open the installed app, then enable notifications.')
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new Error('Notification permission was not granted.')
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(publicKey),
    })
    const response = await fetch('/api/push/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...subscription.toJSON(),
        locale: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        platform: detectPlatform(),
      }),
    })
    if (!response.ok) throw new Error('Slimefish could not save this device.')
    setEnabled(true)
  }

  async function disablePush() {
    const registration = await navigator.serviceWorker.getRegistration('/')
    const subscription = await registration?.pushManager.getSubscription()
    const response = await fetch('/api/push/subscriptions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription?.endpoint }),
    })
    if (!response.ok) throw new Error('Slimefish could not update this device.')
    await subscription?.unsubscribe()
    setEnabled(false)
  }

  async function handleChange(next: boolean) {
    setBusy(true)
    try {
      if (next) await enablePush()
      else await disablePush()
      toast.success(next ? 'Push notifications enabled.' : 'Push notifications disabled.')
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update push notifications.')
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <BellRingIcon className="size-4" />
            <h3 className="text-lg font-semibold">Push notifications</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {iosNeedsInstall
              ? 'On iPhone and iPad, install Slimefish to your Home Screen before enabling notifications.'
              : 'Receive market, transaction, account, and relevant activity updates on this device.'}
          </p>
        </div>
        {busy
          ? <Loader2Icon className="mt-1 size-5 animate-spin text-muted-foreground" />
          : <Switch checked={enabled} onCheckedChange={handleChange} disabled={!supported || iosNeedsInstall} aria-label="Enable push notifications" />}
      </div>
      {enabled && (
        <div className="mt-4 flex items-center gap-2 text-sm text-primary">
          <CheckIcon className="size-4" />
          This device is connected.
        </div>
      )}
      {!supported && <p className="mt-4 text-sm text-muted-foreground">Push requires a supported browser over HTTPS.</p>}
      {iosNeedsInstall && <Button asChild variant="link" className="mt-2 h-auto p-0"><a href="/settings">View installation help</a></Button>}
    </div>
  )
}
