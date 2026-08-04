import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function GET() {
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim()
    || (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID.trim()}.firebaseapp.com` : undefined)

  return NextResponse.json({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  }, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  })
}
