import { NextResponse } from 'next/server'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

function getApiUrl() {
  return process.env.NEXT_PUBLIC_SLIMEFISH_BACKEND_API_URL || 'http://localhost:8000/api'
}

export const maxDuration = 300

async function handleRequest() {
  try {
    const apiUrl = new URL(`${getApiUrl()}/v1/sync/translations`)

    const secret = process.env.TELLWISE_SECRET || 'tellwise_super_secret_bypass_key_123'
    const res = await fetch(apiUrl.toString(), {
      method: 'POST',
      headers: signSlimefishBackendRequest({ url: apiUrl, method: 'POST', headers: {
        'Content-Type': 'application/json',
        'x-tellwise-secret': secret,
      } }),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to sync translations via backend' }, { status: 500 })
    }

    const json = await res.json()
    return NextResponse.json(json)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to sync translations via backend' }, { status: 500 })
  }
}

export async function GET() { return handleRequest() }
export async function POST() { return handleRequest() }
