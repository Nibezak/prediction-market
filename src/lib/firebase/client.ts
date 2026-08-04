'use client'

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth, type Unsubscribe } from 'firebase/auth'

const configuredAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN

function getBrowserAuthDomain() {
  if (configuredAuthDomain) return configuredAuthDomain
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  if (projectId) return `${projectId}.firebaseapp.com`
  return undefined
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

let _cachedApp: FirebaseApp | null | undefined
let _cachedAuth: Auth | null | undefined

function getOrInitApp(): FirebaseApp | null {
  if (_cachedApp) return _cachedApp
  if (!isFirebaseConfigured()) {
    return null
  }
  try {
    const existing = getApps().find((app) => app.name === browserAppName)
    _cachedApp = existing ?? initializeApp(getFirebaseConfig(), browserAppName)
    return _cachedApp
  }
  catch (err) {
    console.warn('Firebase initialization skipped/failed:', err)
    return null
  }
}

export function getOrInitAuth(): Auth | null {
  if (_cachedAuth) return _cachedAuth
  const app = getOrInitApp()
  if (!app) {
    return null
  }
  try {
    _cachedAuth = getAuth(app)
    return _cachedAuth
  }
  catch (err) {
    console.warn('Firebase auth initialization failed:', err)
    return null
  }
}

// Eagerly initialize on module load (client-side only).
// Firebase SDK v10+ uses internal Symbols and _delegate patterns that break
// through Proxy get traps, so we must export the real Auth/App instances.
const _eagerApp = typeof window !== 'undefined' ? getOrInitApp() : null
const _eagerAuth = typeof window !== 'undefined' ? getOrInitAuth() : null

export const firebaseApp: FirebaseApp = _eagerApp ?? {} as FirebaseApp

export const firebaseAuth: Auth = _eagerAuth ?? {
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
} as Auth
