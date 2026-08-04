'use client'

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth, type Unsubscribe } from 'firebase/auth'

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCuLoGr8JqgKx-k95UdTxM2TiTt6-Hmp5M',
  authDomain: 'slimefish-official.firebaseapp.com',
  projectId: 'slimefish-official',
  storageBucket: 'slimefish-official.firebasestorage.app',
  messagingSenderId: '475787665233',
  appId: '1:475787665233:web:d11f4ae257b7a262dafd70',
  measurementId: 'G-WJ69LY1MNH',
}

const configuredAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN

function getBrowserAuthDomain() {
  if (configuredAuthDomain) return configuredAuthDomain
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  if (projectId) return `${projectId}.firebaseapp.com`
  return DEFAULT_FIREBASE_CONFIG.authDomain
}

function getDynamicFirebaseConfig() {
  const windowConfig = typeof window !== 'undefined' ? (window as any).__FIREBASE_CONFIG__ : null
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || windowConfig?.apiKey || DEFAULT_FIREBASE_CONFIG.apiKey,
    authDomain: getBrowserAuthDomain() || windowConfig?.authDomain || DEFAULT_FIREBASE_CONFIG.authDomain,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || windowConfig?.projectId || DEFAULT_FIREBASE_CONFIG.projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || windowConfig?.storageBucket || DEFAULT_FIREBASE_CONFIG.storageBucket,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || windowConfig?.messagingSenderId || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || windowConfig?.appId || DEFAULT_FIREBASE_CONFIG.appId,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || windowConfig?.measurementId || DEFAULT_FIREBASE_CONFIG.measurementId,
  }
}

export function isFirebaseConfigured(): boolean {
  return true
}

function getFirebaseConfig() {
  return getDynamicFirebaseConfig()
}

const browserAppName = 'slimefish-browser'

let _cachedApp: FirebaseApp | null | undefined
let _cachedAuth: Auth | null | undefined

function getOrInitApp(): FirebaseApp {
  if (_cachedApp) return _cachedApp
  try {
    const existing = getApps().find((app) => app.name === browserAppName)
    _cachedApp = existing ?? initializeApp(getFirebaseConfig(), browserAppName)
    return _cachedApp
  }
  catch (err) {
    const existing = getApps().find((app) => app.name === browserAppName)
    _cachedApp = existing ?? initializeApp(DEFAULT_FIREBASE_CONFIG, browserAppName)
    return _cachedApp
  }
}

export function getOrInitAuth(): Auth {
  if (_cachedAuth) return _cachedAuth
  const app = getOrInitApp()
  try {
    _cachedAuth = getAuth(app)
    return _cachedAuth
  }
  catch (err) {
    _cachedAuth = getAuth(getOrInitApp())
    return _cachedAuth
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
