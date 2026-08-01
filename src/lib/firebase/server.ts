import { createRemoteJWKSet, jwtVerify } from 'jose'
import 'server-only'

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

export interface VerifiedFirebaseIdentity {
  uid: string
  email: string
  emailVerified: boolean
  name: string
  picture: string | null
  provider: string
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseIdentity> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim()
  if (!projectId) {
    throw new Error('Firebase project ID is not configured.')
  }

  const { payload, protectedHeader } = await jwtVerify(idToken, FIREBASE_JWKS, {
    algorithms: ['RS256'],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  })

  const uid = typeof payload.sub === 'string' ? payload.sub.trim() : ''
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  const authTime = typeof payload.auth_time === 'number' ? payload.auth_time : 0
  const nowSeconds = Math.floor(Date.now() / 1000)

  if (!uid || !email || protectedHeader.alg !== 'RS256' || authTime <= 0 || authTime > nowSeconds + 30) {
    throw new Error('Firebase identity token is invalid.')
  }

  const firebaseClaim = payload.firebase as { sign_in_provider?: unknown } | undefined

  return {
    uid,
    email,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name.trim() : '',
    picture: typeof payload.picture === 'string' && payload.picture.startsWith('https://') ? payload.picture : null,
    provider: typeof firebaseClaim?.sign_in_provider === 'string' ? firebaseClaim.sign_in_provider : 'firebase',
  }
}
