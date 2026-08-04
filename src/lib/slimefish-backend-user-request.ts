import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { UserRepository } from '@/lib/db/queries/user'
import { getUserPlatformRole } from '@/lib/staff-role'
import { getStaffPermissions } from '@/lib/staff-permissions'
import { getSlimefishBackendBaseUrl, getSlimefishBackendServiceKey, signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

export async function slimefishBackendUserRequest(
  path: string,
  init: RequestInit & { body?: string | null } = {},
) {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null)
  if (!session?.user?.id) return { response: null, session: null }
  const accountUser = await UserRepository.getCurrentUser({ minimal: true }).catch(() => null)
  const requestUser = accountUser || session.user

  const url = `${getSlimefishBackendBaseUrl()}/${path.replace(/^\//, '')}`
  const requestHeaders = new Headers(init.headers)
  requestHeaders.set('content-type', 'application/json')
  requestHeaders.set('x-tellwise-secret', getSlimefishBackendServiceKey())
  requestHeaders.set('x-tellwise-user-id', requestUser.id)
  requestHeaders.set('x-tellwise-user-email', requestUser.email || '')
  requestHeaders.set('x-tellwise-role', getUserPlatformRole(requestUser as any))
  requestHeaders.set('x-tellwise-permissions', getStaffPermissions(requestUser as any).join(','))

  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: signSlimefishBackendRequest({
      url,
      method: init.method || 'GET',
      body: init.body,
      headers: requestHeaders,
    }),
  })
  return { response, session }
}
