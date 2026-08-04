import type { User } from '@/types'
import { getUserPlatformRole } from '@/lib/staff-role'
import type { AdminWorkspaceId } from '@/lib/staff-role'

const groups = {
  Users: ['users.view', 'users.search', 'users.profile.view', 'users.profile.edit', 'users.roles.manage', 'users.permissions.manage', 'users.block', 'users.unblock', 'users.mirror', 'users.create'],
  Markets: ['markets.view', 'markets.create', 'markets.edit', 'markets.publish', 'markets.close', 'markets.resolve', 'markets.cancel', 'markets.liquidity.manage', 'markets.images.manage', 'markets.categories.manage'],
  Finance: ['finance.view', 'finance.ledger.view', 'finance.settings.manage', 'finance.deposit.review', 'finance.deposit.adjust', 'finance.withdrawal.review', 'finance.withdrawal.approve', 'finance.withdrawal.reject', 'finance.refund.create', 'finance.reversal.create', 'finance.reconcile'],
  Risk: ['risk.view', 'risk.signal.inspect', 'risk.signal.resolve', 'risk.account.flag', 'risk.account.unflag', 'risk.funds.hold', 'risk.funds.release', 'risk.rules.view', 'risk.rules.edit', 'risk.export'],
  Community: ['community.view', 'community.comment.hide', 'community.comment.delete', 'community.comment.restore', 'community.user.warn', 'community.report.review', 'community.report.resolve', 'community.topic.manage', 'community.notification.send', 'community.export'],
  Support: ['support.view', 'support.case.create', 'support.case.assign', 'support.case.update', 'support.case.close', 'support.note.add', 'support.balance.view', 'support.deposit.assist', 'support.withdrawal.assist', 'support.export'],
  Operations: ['operations.view', 'operations.health.view', 'operations.jobs.view', 'operations.jobs.retry', 'operations.jobs.cancel', 'operations.feature_flags.view', 'operations.feature_flags.manage', 'operations.maintenance.manage', 'operations.incident.manage', 'operations.export'],
  Audit: ['audit.view', 'audit.search', 'audit.filter', 'audit.evidence.view', 'audit.ip.view', 'audit.export', 'audit.retention.view', 'audit.retention.manage', 'audit.alert.manage', 'audit.verify'],
  Configuration: ['settings.view', 'settings.brand.manage', 'settings.theme.manage', 'settings.locale.manage', 'settings.integration.manage', 'settings.ai.manage', 'settings.fees.manage', 'settings.geoblocking.manage', 'settings.social.manage', 'settings.featured.manage'],
  Governance: ['governance.view', 'governance.approval.request', 'governance.approval.review', 'governance.approval.approve', 'governance.approval.reject', 'governance.resolution.propose', 'governance.resolution.approve', 'governance.payout.approve', 'governance.dispute.review', 'governance.report.export'],
} as const

export const STAFF_PERMISSION_GROUPS = Object.entries(groups).map(([label, permissions]) => ({ label, permissions: [...permissions] }))
export const STAFF_PERMISSIONS = STAFF_PERMISSION_GROUPS.flatMap(group => group.permissions)
export type StaffPermission = typeof STAFF_PERMISSIONS[number]

const rolePresets: Record<string, StaffPermission[]> = {
  USER: [],
  SUPER_ADMIN: STAFF_PERMISSIONS,
  EDITOR: ['markets.view', 'markets.create', 'markets.edit', 'markets.images.manage', 'markets.categories.manage', 'governance.approval.request', 'audit.view'],
  MODERATOR: ['users.view', 'users.search', 'users.profile.view', 'users.block', 'users.unblock', 'markets.view', 'markets.close', 'markets.resolve', 'risk.view', 'risk.signal.inspect', 'risk.signal.resolve', 'risk.account.flag', 'community.view', 'community.comment.hide', 'community.report.review', 'audit.view', 'audit.search', 'audit.evidence.view', 'audit.ip.view'],
  RESOLVER: ['markets.view', 'markets.close', 'markets.resolve', 'governance.view', 'governance.resolution.propose', 'audit.view'],
  SUPPORT: ['users.view', 'users.search', 'users.profile.view', 'support.view', 'support.case.create', 'support.case.update', 'support.note.add', 'support.balance.view', 'support.deposit.assist', 'support.withdrawal.assist', 'risk.view', 'audit.view'],
  FINANCE: ['users.view', 'users.search', 'users.profile.view', 'finance.view', 'finance.ledger.view', 'finance.settings.manage', 'finance.deposit.review', 'finance.withdrawal.review', 'finance.withdrawal.approve', 'finance.withdrawal.reject', 'finance.refund.create', 'finance.reversal.create', 'finance.reconcile', 'risk.view', 'risk.signal.inspect', 'risk.funds.hold', 'risk.funds.release', 'governance.payout.approve', 'audit.view', 'audit.search', 'audit.evidence.view', 'audit.ip.view', 'audit.export'],
  ADMIN: STAFF_PERMISSIONS,
}

export function getStaffPermissions(user: Partial<User> | null | undefined): StaffPermission[] {
  if (!user) return []
  const role = getUserPlatformRole(user)
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return STAFF_PERMISSIONS
  const configured = (user.settings as any)?.staff_permissions
  if (Array.isArray(configured)) {
    const allowed = new Set(STAFF_PERMISSIONS)
    return configured.filter((value): value is StaffPermission => typeof value === 'string' && allowed.has(value as StaffPermission))
  }
  return rolePresets[role] || []
}

export function hasStaffPermission(user: Partial<User> | null | undefined, permission: StaffPermission) {
  return getStaffPermissions(user).includes(permission)
}

export function getRolePermissionPreset(role: string) {
  return rolePresets[role.toUpperCase()] || []
}

const workspacePermissions: Record<AdminWorkspaceId, StaffPermission[]> = {
  operations: ['operations.view'],
  'market-review': ['markets.view'],
  resolutions: ['markets.resolve', 'governance.resolution.propose'],
  risk: ['risk.view'],
  support: ['support.view'],
  finance: ['finance.view', 'finance.ledger.view'],
  approvals: ['governance.approval.review'],
  audit: ['audit.view'],
  communications: ['community.notification.send'],
  system: ['operations.health.view'],
  'access-control': ['users.permissions.manage', 'users.roles.manage'],
}

export function canAccessWorkspaceWithPermissions(user: Partial<User> | null | undefined, workspace: string): workspace is AdminWorkspaceId {
  const role = getUserPlatformRole(user)
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return true
  const required = workspacePermissions[workspace as AdminWorkspaceId]
  return Boolean(required?.some(permission => hasStaffPermission(user, permission)))
}
