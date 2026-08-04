import type { LucideIcon } from 'lucide-react'
import { ActivityIcon, ArrowLeftRightIcon, BanknoteArrowDownIcon, BellRingIcon, BookOpenCheckIcon, CircleGaugeIcon, ClipboardClockIcon, FileClockIcon, HistoryIcon, LandmarkIcon, ListRestartIcon, MegaphoneIcon, RadioTowerIcon, ScanSearchIcon, SendIcon, Settings2Icon, ShieldAlertIcon, UserXIcon, WalletCardsIcon } from 'lucide-react'
import type { AdminWorkspaceId } from '@/lib/staff-role'

export type AdminWorkspaceSection = { id: string, label: string, description: string, icon: LucideIcon, showInTabs?: boolean }

export const ADMIN_WORKSPACE_SECTIONS: Partial<Record<AdminWorkspaceId, AdminWorkspaceSection[]>> = {
  operations: [
    { id: 'overview', label: 'Overview', description: 'Queue health and direct paths to operational work.', icon: CircleGaugeIcon },
    { id: 'markets', label: 'Market actions', description: 'Ended markets waiting for an outcome or extension.', icon: ScanSearchIcon },
    { id: 'publishing', label: 'Publishing', description: 'Draft and deployment requests that have not completed.', icon: SendIcon },
    { id: 'services', label: 'Services', description: 'Dependency readiness and response latency.', icon: ActivityIcon },
    { id: 'jobs', label: 'Background jobs', description: 'Inspect and retry failed worker jobs.', icon: ListRestartIcon },
    { id: 'accounts', label: 'Restricted accounts', description: 'Blocked or trading-suspended accounts needing review.', icon: UserXIcon },
    { id: 'trades', label: 'Ledger trades', description: 'Latest completed trades from the internal ledger.', icon: ArrowLeftRightIcon },
  ],
  risk: [
    { id: 'overview', label: 'Overview', description: 'Open cases, held funds, and triggered signal totals.', icon: CircleGaugeIcon },
    { id: 'cases', label: 'Investigations', description: 'Explainable risk cases and their supporting evidence.', icon: ShieldAlertIcon },
  ],
  finance: [
    { id: 'overview', label: 'Overview', description: 'Treasury solvency, customer liabilities, commissions, and settlement health.', icon: CircleGaugeIcon },
    { id: 'treasury', label: 'Treasury', description: 'Cloud9 wallet balance and provider statement.', icon: LandmarkIcon },
    { id: 'wallet', label: 'Wallet', description: 'Customer balances, market reserves, deposits, and withdrawals.', icon: WalletCardsIcon },
    { id: 'commissions', label: 'Commissions', description: 'Company fees and market-liquidity allocations.', icon: BanknoteArrowDownIcon },
    { id: 'transactions', label: 'Transactions', description: 'Search deposits and withdrawals across provider and ledger references.', icon: ArrowLeftRightIcon },
    { id: 'settings', label: 'Settings', description: 'Configure trade limits, liquidity, and gradual profit commission.', icon: Settings2Icon },
  ],
  audit: [
    { id: 'overview', label: 'Overview', description: 'Retention totals for each audit evidence stream.', icon: CircleGaugeIcon },
    { id: 'actions', label: 'Platform actions', description: 'Authentication, staff, money, market, and security actions.', icon: HistoryIcon },
    { id: 'conditions', label: 'Condition changes', description: 'Before and after snapshots from condition audit triggers.', icon: BookOpenCheckIcon },
    { id: 'creations', label: 'Market creation', description: 'Market deployment history, ownership, and failures.', icon: ClipboardClockIcon },
  ],
  communications: [
    { id: 'history', label: 'Campaigns', description: 'Review notification campaigns, delivery history, and recipients.', icon: BellRingIcon },
    { id: 'compose', label: 'Create', description: 'Create a targeted in-app and push notification campaign.', icon: MegaphoneIcon, showInTabs: false },
  ],
  system: [
    { id: 'services', label: 'Services', description: 'Dependency readiness and response latency.', icon: RadioTowerIcon },
    { id: 'jobs', label: 'Background jobs', description: 'Inspect and retry failed worker jobs.', icon: FileClockIcon },
  ],
}

export function getAdminWorkspaceSections(workspace: AdminWorkspaceId) {
  return ADMIN_WORKSPACE_SECTIONS[workspace] || []
}

export function getDefaultAdminWorkspaceSection(workspace: AdminWorkspaceId) {
  return getAdminWorkspaceSections(workspace)[0]?.id || null
}
