'use client'

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth, type Unsubscribe } from 'firebase/auth'

const configuredAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN

function getBrowserAuthDomain() {
  if (typeof window === 'undefined') return configuredAuthDomain

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return configuredAuthDomain
  }

  return window.location.host
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: getBrowserAuthDomain(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

export function isFirebaseConfigured(): boolean {
  const missing = Object.entries(firebaseConfig)
    .filter(([key, value]) => key !== 'measurementId' && !value?.trim())
    .map(([key]) => key)

  return missing.length === 0
}

function getFirebaseConfig() {
  const missing = Object.entries(firebaseConfig)
    .filter(([key, value]) => key !== 'measurementId' && !value?.trim())
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(`Firebase is not configured. Missing: ${missing.join(', ')}`)
  }

  return firebaseConfig as Required<Omit<typeof firebaseConfig, 'measurementId'>> & Pick<typeof firebaseConfig, 'measurementId'>
}

const browserAppName = 'slimefish-browser'

function initApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null
  try {
    const existing = getApps().find((app) => app.name === browserAppName)
    return existing ?? initializeApp(getFirebaseConfig(), browserAppName)
  }
  catch (err) {
    console.warn('Firebase initialization skipped/failed:', err)
    return null
  }
}

function initAuth(): Auth | null {
  const app = initApp()
  if (!app) return null
  try {
    return getAuth(app)
  }
  catch (err) {
    console.warn('Firebase auth initialization failed:', err)
    return null
  }
}

const dummyAuth: Auth = {
  app: {} as FirebaseApp,
  name: 'dummy',
  config: {} as any,
  currentUser: null,
  tenantId: null,
  settings: {} as any,
  languageCode: null,
  emulatorConfig: null,
  onAuthStateChanged: () => (() => {}) as Unsubscribe,
  onIdTokenChanged: () => (() => {}) as Unsubscribe,
  beforeAuthStateChanged: () => (() => {}) as Unsubscribe,
  setPersistence: async () => {},
  signOut: async () => {},
  useDeviceLanguage: () => {},
}

export const firebaseApp: FirebaseApp = new Proxy({} as FirebaseApp, {
  get(_target, prop) {
    const realApp = initApp()
    if (realApp) {
      const val = (realApp as any)[prop]
      return typeof val === 'function' ? val.bind(realApp) : val
    }
    return undefined
  },
})

export const firebaseAuth: Auth = new Proxy(dummyAuth, {
  get(_target, prop) {
    const realAuth = initAuth()
    if (realAuth) {
      const val = (realAuth as any)[prop]
      return typeof val === 'function' ? val.bind(realAuth) : val
    }
    const dummyVal = (dummyAuth as any)[prop]
    if (typeof dummyVal === 'function') {
      return dummyVal.bind(dummyAuth)
    }
    return dummyVal
  },
})
