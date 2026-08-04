'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

const UPDATE_REMINDER_STORAGE_KEY = 'slimefish:pwa-update-remind-after'
const UPDATE_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000
const LOCAL_SW_CLEANUP_RELOAD_KEY = 'slimefish:local-sw-cleanup-reloaded'

function isLocalhostHost(hostname: string) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname === '[::1]'
}

function useServiceWorkerRegistration() {
  useEffect(function manageServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      return
    }

    if (process.env.NODE_ENV !== 'production' || isLocalhostHost(window.location.hostname)) {
      void navigator.serviceWorker.getRegistrations()
        .then(async (registrations) => {
          if (registrations.length === 0) {
            window.sessionStorage.removeItem(LOCAL_SW_CLEANUP_RELOAD_KEY)
            return
          }
          await Promise.all(registrations.map(registration => registration.unregister()))
          if (navigator.serviceWorker.controller && window.sessionStorage.getItem(LOCAL_SW_CLEANUP_RELOAD_KEY) !== 'true') {
            window.sessionStorage.setItem(LOCAL_SW_CLEANUP_RELOAD_KEY, 'true')
            window.location.reload()
          }
        })
        .catch((error) => {
          console.error('Failed to unregister service workers', error)
        })
      if ('caches' in window) {
        void window.caches.keys()
          .then(cacheKeys => Promise.all(cacheKeys.map(cacheKey => window.caches.delete(cacheKey))))
          .catch((error) => {
            console.error('Failed to clear cache storage', error)
          })
      }
      return
    }

    let refreshing = false
    let updateToastId: string | number | undefined

    function canShowUpdatePrompt() {
      const remindAfter = Number(window.localStorage.getItem(UPDATE_REMINDER_STORAGE_KEY) || '0')
      return !Number.isFinite(remindAfter) || Date.now() >= remindAfter
    }

    function remindTomorrow() {
      window.localStorage.setItem(UPDATE_REMINDER_STORAGE_KEY, String(Date.now() + UPDATE_REMINDER_DELAY_MS))
      if (updateToastId) {
        toast.dismiss(updateToastId)
      }
    }

    function activateUpdate(registration: ServiceWorkerRegistration) {
      window.localStorage.removeItem(UPDATE_REMINDER_STORAGE_KEY)
      registration.waiting?.postMessage({ type: 'SLIMEFISH_SKIP_WAITING' })
      if (updateToastId) {
        toast.dismiss(updateToastId)
      }
    }

    function promptForUpdate(registration: ServiceWorkerRegistration) {
      if (!registration.waiting || !canShowUpdatePrompt()) {
        return
      }
      updateToastId = toast.custom(toastId => (
        <div className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-start gap-3 px-4 pt-4 pb-3">
            <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-5">A fresh Slimefish update is ready</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">Get the latest fixes and app changes.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-border px-4 py-3">
            <button
              type="button"
              className="h-9 rounded-md px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => {
                remindTomorrow()
                toast.dismiss(toastId)
              }}
            >
              Tomorrow
            </button>
            <button
              type="button"
              className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              onClick={() => {
                activateUpdate(registration)
                toast.dismiss(toastId)
              }}
            >
              Update now
            </button>
          </div>
        </div>
      ), {
        duration: Number.POSITIVE_INFINITY,
      })
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })

    void navigator.serviceWorker
      .register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
      .then((registration) => {
        promptForUpdate(registration)
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing
          if (!installingWorker) return
          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              promptForUpdate(registration)
            }
          })
        })
        window.setInterval(() => {
          void registration.update().catch(() => null)
        }, 60 * 60 * 1000)
      })
      .catch((error) => {
        console.error('Failed to register service worker', error)
      })
  }, [])
}

export default function PwaServiceWorker() {
  useServiceWorkerRegistration()

  return null
}
