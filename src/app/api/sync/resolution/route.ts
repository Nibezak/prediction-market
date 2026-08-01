import { NextResponse } from 'next/server'
import { getSlimefishBackendServiceKey, signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

function getApiUrl() {
  return process.env.NEXT_PUBLIC_SLIMEFISH_BACKEND_API_URL || 'http://localhost:8000/api'
}

export const maxDuration = 300

async function handleRequest() {
  try {
    const apiUrl = new URL(`${getApiUrl()}/v1/sync/resolution`)

    const secret = getSlimefishBackendServiceKey()
    if (!secret) {
      return NextResponse.json({ error: 'Backend service authentication is not configured.' }, { status: 503 })
    }
    const res = await fetch(apiUrl.toString(), {
      method: 'POST',
      headers: signSlimefishBackendRequest({ url: apiUrl, method: 'POST', headers: {
        'Content-Type': 'application/json',
        'x-tellwise-secret': secret,
      } }),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to sync resolution via backend' }, { status: 500 })
    }

    const json = await res.json()
    return NextResponse.json(json)
  }
  catch {
    return NextResponse.json({ error: 'Failed to sync resolution via backend' }, { status: 500 })
  }
}

export async function GET() {
  return handleRequest()
}

export async function POST() {
  return handleRequest()
}
