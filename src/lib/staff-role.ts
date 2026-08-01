import type { User } from '@/types'
import { isAdminEmail, isSuperAdminEmail } from '@/lib/admin'

export const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'MODERATOR', 'RESOLVER', 'SUPPORT', 'FINANCE'] as const
export type StaffRole = typeof STAFF_ROLES[number]
export type PlatformRole = StaffRole | 'USER'

export const ADMIN_WORKSPACE_IDS = [
  'operations',
  'market-review',
  'resolutions',
  'risk',
  'support',
  'finance',
  'approvals',
  'audit',
  'communications',
  'system',
  'access-control',
] as const
export type AdminWorkspaceId = typeof ADMIN_WORKSPACE_IDS[number]

export const ADMIN_WORKSPACES_BY_ROLE: Record<PlatformRole, AdminWorkspaceId[]> = {
  SUPER_ADMIN: [...ADMIN_WORKSPACE_IDS],
  ADMIN: [...ADMIN_WORKSPACE_IDS],
  EDITOR: ['operations', 'market-review', 'approvals', 'audit', 'communications'],
  MODERATOR: ['operations', 'market-review', 'resolutions', 'risk', 'support', 'audit', 'communications'],
  RESOLVER: ['operations', 'market-review', 'resolutions', 'audit', 'system'],
  SUPPORT: ['operations', 'risk', 'support', 'audit', 'communications', 'system'],
  FINANCE: ['operations', 'resolutions', 'risk', 'finance', 'audit', 'system'],
  USER: [],
}

export function canAccessAdminWorkspace(role: PlatformRole, workspace: string): workspace is AdminWorkspaceId {
  return ADMIN_WORKSPACES_BY_ROLE[role].includes(workspace as AdminWorkspaceId)
}

export function normalizePlatformRole(value: unknown): PlatformRole {
  const role = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return role === 'USER' || STAFF_ROLES.includes(role as StaffRole)
    ? role as PlatformRole
    : 'USER'
}

export function getUserPlatformRole(user: Partial<User> | null | undefined): PlatformRole {
  if (!user) return 'USER'
  if (isSuperAdminEmail(user.email)) return 'SUPER_ADMIN'
  if (user.is_admin || isAdminEmail(user.email)) return 'ADMIN'
  return normalizePlatformRole(user.role ?? user.settings?.staff_role)
}

export function isProtectedSuperAdmin(user: Partial<User> | null | undefined) {
  return isSuperAdminEmail(user?.email) || getUserPlatformRole(user) === 'SUPER_ADMIN'
}

export function isStaffUser(user: Partial<User> | null | undefined) {
  if (getUserPlatformRole(user) !== 'USER') return true
  const configured = (user?.settings as any)?.staff_permissions
  return Array.isArray(configured) && configured.length > 0
}

export function canManageUsers(user: Partial<User> | null | undefined) {
  if (['SUPER_ADMIN', 'ADMIN'].includes(getUserPlatformRole(user))) return true
  const configured = (user?.settings as any)?.staff_permissions
  return Array.isArray(configured)
    && (configured.includes('users.roles.manage') || configured.includes('users.permissions.manage'))
}

export function canViewUserAccounts(user: Partial<User> | null | undefined) {
  return isStaffUser(user)
}

export function canMoveUserFunds(user: Partial<User> | null | undefined) {
  return ['SUPER_ADMIN', 'ADMIN', 'FINANCE'].includes(getUserPlatformRole(user))
}

export function canReviewRisk(user: Partial<User> | null | undefined) {
  return ['SUPER_ADMIN', 'ADMIN', 'FINANCE', 'MODERATOR', 'SUPPORT'].includes(getUserPlatformRole(user))
}
