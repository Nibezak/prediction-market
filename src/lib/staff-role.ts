import type { User } from '@/types'
import { isAdminEmail } from '@/lib/admin'

export const STAFF_ROLES = ['ADMIN', 'EDITOR', 'MODERATOR', 'RESOLVER', 'SUPPORT', 'FINANCE'] as const
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
  if (user.is_admin || isAdminEmail(user.email)) return 'ADMIN'
  return normalizePlatformRole(user.role ?? user.settings?.staff_role)
}

export function isStaffUser(user: Partial<User> | null | undefined) {
  return getUserPlatformRole(user) !== 'USER'
}

export function canManageUsers(user: Partial<User> | null | undefined) {
  return getUserPlatformRole(user) === 'ADMIN'
}

export function canViewUserAccounts(user: Partial<User> | null | undefined) {
  return isStaffUser(user)
}

export function canMoveUserFunds(user: Partial<User> | null | undefined) {
  return ['ADMIN', 'FINANCE'].includes(getUserPlatformRole(user))
}

export function canReviewRisk(user: Partial<User> | null | undefined) {
  return ['ADMIN', 'FINANCE', 'MODERATOR', 'SUPPORT'].includes(getUserPlatformRole(user))
}
