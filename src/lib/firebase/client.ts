'use client'

import { getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const configuredAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN

function getBrowserAuthDomain() {
  if (typeof window === 'undefined') return configuredAuthDomain

  // Firebase always loads authDomain helpers over HTTPS. The local Next.js
  // development server is HTTP, so its hosted Firebase helper must be used.
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return configuredAuthDomain
  }

  return window.location.host
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  // The app proxies Firebase's auth helper under /__/auth. Keeping the helper
  // on the current origin prevents redirect state from being partitioned.
  authDomain: getBrowserAuthDomain(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

function requireFirebaseConfig() {
  const missing = Object.entries(firebaseConfig)
    .filter(([key, value]) => key !== 'measurementId' && !value?.trim())
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(`Firebase is not configured. Missing: ${missing.join(', ')}`)
  }

  return firebaseConfig as Required<Omit<typeof firebaseConfig, 'measurementId'>> & Pick<typeof firebaseConfig, 'measurementId'>
}

const browserAppName = 'slimefish-browser'
const existingBrowserApp = getApps().find((app) => app.name === browserAppName)

export const firebaseApp = existingBrowserApp ?? initializeApp(requireFirebaseConfig(), browserAppName)
export const firebaseAuth = getAuth(firebaseApp)
