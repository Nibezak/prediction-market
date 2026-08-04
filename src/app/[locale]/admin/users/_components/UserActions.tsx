'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Ban, KeyRound, MoreHorizontal, RotateCcw, ScanEye, ShieldCheck } from 'lucide-react'
import { refundUserTrades } from '@/app/[locale]/admin/users/_actions/refund-user-trades'
import { toast } from 'sonner'
import { authorizeWithdrawalPasscodeReset, toggleUserBlockedStatus, updateUserRole } from '@/app/[locale]/admin/users/_actions/update-user-status'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getRolePermissionPreset, STAFF_PERMISSION_GROUPS } from '@/lib/staff-permissions'
import { useUser } from '@/stores/useUser'

const ROLES = ['USER', 'EDITOR', 'MODERATOR', 'RESOLVER', 'SUPPORT', 'FINANCE', 'ADMIN'] as const
type Role = typeof ROLES[number]

interface UserActionsProps {
  user: { id: string, username: string, email: string, is_blocked?: boolean, role?: string, settings?: Record<string, unknown> }
}

export function UserActions({ user }: UserActionsProps) {
  const queryClient = useQueryClient()
  const currentUser = useUser()
  const isAdmin = currentUser?.is_admin === true || currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN'
  const currentPermissions = Array.isArray(currentUser?.settings?.staff_permissions) ? currentUser.settings.staff_permissions as string[] : []
  const canMirror = isAdmin || currentPermissions.includes('users.mirror')
  const canManageRoles = isAdmin || currentPermissions.includes('users.roles.manage') || currentPermissions.includes('users.permissions.manage')
  const canBlock = isAdmin || currentPermissions.includes('users.block') || currentPermissions.includes('users.unblock')
  const canRefund = isAdmin || currentUser?.role === 'FINANCE' || currentPermissions.includes('users.balance.adjust')
  const [dialog, setDialog] = useState<'role' | 'passcode' | 'block' | 'mirror' | 'refund' | null>(null)
  const [loading, setLoading] = useState(false)
  const [isBlocked, setIsBlocked] = useState(Boolean(user.is_blocked))
  const [role, setRole] = useState<Role>((ROLES.includes(user.role as Role) ? user.role : 'USER') as Role)
  const configured = user.settings?.staff_permissions
  const [permissions, setPermissions] = useState<string[]>(Array.isArray(configured) ? configured as string[] : getRolePermissionPreset(role))
  const [search, setSearch] = useState('')
  const [refundMarketId, setRefundMarketId] = useState('')
  const [refundEventId, setRefundEventId] = useState('')
  const [refundFrom, setRefundFrom] = useState('')
  const [refundTo, setRefundTo] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const filteredGroups = useMemo(() => STAFF_PERMISSION_GROUPS.map(group => ({ ...group, permissions: group.permissions.filter(value => value.includes(search.trim().toLowerCase())) })).filter(group => group.permissions.length), [search])

  useEffect(() => {
    if (dialog) return

    const cleanup = window.setTimeout(() => {
      if (!document.querySelector('[data-slot="dialog-content"][data-state="open"], [data-slot="dropdown-menu-content"][data-state="open"]')) {
        document.body.style.removeProperty('pointer-events')
      }
    }, 0)

    return () => window.clearTimeout(cleanup)
  }, [dialog])

  function openDialog(nextDialog: NonNullable<typeof dialog>) {
    window.requestAnimationFrame(() => setDialog(nextDialog))
  }

  async function refresh() { await queryClient.invalidateQueries({ queryKey: ['admin-users'] }) }
  async function saveRole() {
    setLoading(true)
    const result = await updateUserRole(user.id, role, permissions)
    setLoading(false)
    if (result.error) return toast.error('Could not update access', { description: result.error })
    toast.success('Role and permissions updated')
    setDialog(null)
    await refresh()
  }
  async function toggleBlock() {
    setLoading(true)
    const nextBlockedState = !isBlocked
    const result = await toggleUserBlockedStatus(user.id, nextBlockedState)
    setLoading(false)
    if (result.error) return toast.error('Could not update user', { description: result.error })
    setIsBlocked(nextBlockedState)
    toast.success(nextBlockedState ? 'User blocked' : 'User unblocked')
    setDialog(null)
    await refresh()
  }
  async function startMirror() {
    setLoading(true)
    const response = await fetch('/api/admin/mirror', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetUserId: user.id }) })
    const result = await response.json().catch(() => null)
    setLoading(false)
    if (!response.ok) return toast.error('Could not mirror user', { description: result?.error || 'Request failed' })
    window.location.assign('/')
  }
  async function refundTrades() {
    setLoading(true)
    const result = await refundUserTrades(user.id, {
      marketId: refundMarketId.trim() || undefined,
      eventId: refundEventId.trim() || undefined,
      from: refundFrom || undefined,
      to: refundTo || undefined,
      reason: refundReason.trim() || undefined,
    })
    setLoading(false)
    if (result.error) return toast.error('Could not refund trades', { description: result.error })
    toast.success(`Refunded ${result.refundedCount ?? 0} trade${result.refundedCount === 1 ? '' : 's'}`)
    setDialog(null)
    await refresh()
  }

  async function resetWithdrawalPasscode() {
    setLoading(true)
    const result = await authorizeWithdrawalPasscodeReset(user.id)
    setLoading(false)
    if (result.error) return toast.error('Could not authorize reset', { description: result.error })
    toast.success('Passcode reset authorized', { description: 'The user must create a new passcode before withdrawing.' })
    setDialog(null)
    await refresh()
  }

  return <>
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8"><MoreHorizontal className="size-4" /><span className="sr-only">User actions</span></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canMirror && <DropdownMenuItem onSelect={() => openDialog('mirror')}><ScanEye className="mr-2 size-4" />Mirror user</DropdownMenuItem>}
        {canManageRoles && <DropdownMenuItem onSelect={() => openDialog('role')}><ShieldCheck className="mr-2 size-4" />Roles and permissions</DropdownMenuItem>}
        {canRefund && <DropdownMenuItem onSelect={() => openDialog('refund')}><RotateCcw className="mr-2 size-4" />Refund trades</DropdownMenuItem>}
        {canManageRoles && <DropdownMenuItem onSelect={() => openDialog('passcode')}><KeyRound className="mr-2 size-4" />Change passcode</DropdownMenuItem>}
        {canBlock && (
          <DropdownMenuItem
            className={isBlocked ? "text-emerald-600 dark:text-emerald-400 focus:text-emerald-600 focus:bg-emerald-500/10 font-medium" : "text-destructive focus:text-destructive"}
            onSelect={() => openDialog('block')}
          >
            <Ban className="mr-2 size-4" />
            {isBlocked ? 'Unblock user' : 'Block user'}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>

    <Dialog open={dialog === 'role'} onOpenChange={open => !open && setDialog(null)}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Roles and permissions</DialogTitle><DialogDescription>Choose a preset, then tailor this user&apos;s access. Sensitive actions are verified again by the server.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2"><Label>Role preset</Label><Select value={role} onValueChange={value => { const next = value as Role; setRole(next); setPermissions(getRolePermissionPreset(next)) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLES.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search permissions" />
          <div className="grid gap-5 md:grid-cols-2">{filteredGroups.map(group => <section key={group.label} className="min-w-0 space-y-2"><h3 className="font-medium">{group.label}</h3>{group.permissions.map(permission => <label key={permission} className="flex items-center gap-2 text-sm"><Checkbox checked={permissions.includes(permission)} onCheckedChange={checked => setPermissions(current => checked ? [...new Set([...current, permission])] : current.filter(value => value !== permission))} /><span className="break-all">{permission}</span></label>)}</section>)}</div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={saveRole} disabled={loading}>{loading ? 'Saving...' : 'Save access'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={dialog === 'mirror'} onOpenChange={open => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>Mirror {user.email}</DialogTitle><DialogDescription>This starts a 15-minute audited support session as this user.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={startMirror} disabled={loading}>{loading ? 'Starting...' : 'Mirror user'}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialog === 'refund'} onOpenChange={open => !open && setDialog(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund trades for {user.email}</DialogTitle>
          <DialogDescription>Reverse this user&apos;s trade ledger entries. Use the optional filters to refund only a market, event, or time window.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2"><Label htmlFor="refund-market">Market ID</Label><Input id="refund-market" value={refundMarketId} onChange={event => setRefundMarketId(event.target.value)} placeholder="Optional market ID" /></div>
          <div className="grid gap-2"><Label htmlFor="refund-event">Event ID</Label><Input id="refund-event" value={refundEventId} onChange={event => setRefundEventId(event.target.value)} placeholder="Optional event ID" /></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="refund-from">From</Label><Input id="refund-from" type="datetime-local" value={refundFrom} onChange={event => setRefundFrom(event.target.value)} /></div>
            <div className="grid gap-2"><Label htmlFor="refund-to">To</Label><Input id="refund-to" type="datetime-local" value={refundTo} onChange={event => setRefundTo(event.target.value)} /></div>
          </div>
          <div className="grid gap-2"><Label htmlFor="refund-reason">Reason</Label><Input id="refund-reason" value={refundReason} onChange={event => setRefundReason(event.target.value)} placeholder="Market canceled, data issue, manual correction..." /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button variant="destructive" onClick={refundTrades} disabled={loading}>{loading ? 'Refunding...' : 'Refund matching trades'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={dialog === 'passcode'} onOpenChange={open => !open && setDialog(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Authorize passcode reset</DialogTitle>
          <DialogDescription>Only continue after support has verified the account owner. The existing passcode cannot be viewed; this invalidates it and asks the user to create a new one.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
          <Button onClick={resetWithdrawalPasscode} disabled={loading}>{loading ? 'Authorizing...' : 'Authorize reset'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={dialog === 'block'} onOpenChange={open => !open && setDialog(null)}><DialogContent><DialogHeader><DialogTitle>{isBlocked ? 'Unblock user' : 'Block user'}</DialogTitle><DialogDescription>{isBlocked ? 'Restore this user\'s platform access?' : 'Suspend trading, deposits, and withdrawals while this account is reviewed?'}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button variant={isBlocked ? 'default' : 'destructive'} onClick={toggleBlock} disabled={loading}>{loading ? 'Saving...' : isBlocked ? 'Unblock' : 'Block'}</Button></DialogFooter></DialogContent></Dialog>
  </>
}
