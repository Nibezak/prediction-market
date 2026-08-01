'use client'

import { useExtracted } from 'next-intl'
import { DataTable } from '@/app/[locale]/admin/_components/DataTable'
import { useAdminUsersTable } from '@/app/[locale]/admin/_hooks/useAdminUsers'
import { useAdminUsersColumns } from './columns'

import { useMemo, useState } from 'react'
import type { RowSelectionState } from '@tanstack/react-table'
import { ShieldIcon, LockIcon, UnlockIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { bulkToggleUserBlockedStatus, bulkUpdateUserRoles } from '../_actions/update-user-status'
import { toast } from 'sonner'

const USER_ROLES = ['USER', 'EDITOR', 'MODERATOR', 'RESOLVER', 'SUPPORT', 'FINANCE', 'ADMIN'] as const

export default function AdminUsersTable() {
  const t = useExtracted()
  const columns = useAdminUsersColumns()
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [isBulkPending, setIsBulkPending] = useState(false)

  const {
    users,
    totalCount,
    isLoading,
    error,
    retry,
    pageIndex,
    pageSize,
    search,
    sortBy,
    sortOrder,
    handleSearchChange,
    handleSortChange,
    handlePageChange,
    handlePageSizeChange,
  } = useAdminUsersTable()

  const [statusFilter, setStatusFilter] = useState<'all' | 'blocked' | 'allowed'>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (statusFilter === 'blocked' && !u.is_blocked) return false
      if (statusFilter === 'allowed' && u.is_blocked) return false

      if (roleFilter !== 'all') {
        const uRole = (u.role || (u.is_admin ? 'ADMIN' : 'USER')).toUpperCase()
        if (uRole !== roleFilter.toUpperCase()) return false
      }

      return true
    })
  }, [users, statusFilter, roleFilter])

  const selectedIndexes = Object.keys(rowSelection).filter(key => rowSelection[key])
  const selectedUserIds = selectedIndexes
    .map(indexStr => filteredUsers[Number(indexStr)]?.id)
    .filter((id): id is string => Boolean(id))

  async function handleBulkBlock(isBlocked: boolean) {
    if (selectedUserIds.length === 0) return
    setIsBulkPending(true)
    try {
      const res = await bulkToggleUserBlockedStatus(selectedUserIds, isBlocked)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success(isBlocked ? `Blocked ${res.successCount} user(s)` : `Unblocked ${res.successCount} user(s)`)
        setRowSelection({})
        retry()
      }
    } catch {
      toast.error('Failed to perform bulk action')
    } finally {
      setIsBulkPending(false)
    }
  }

  async function handleBulkRole(role: typeof USER_ROLES[number]) {
    if (selectedUserIds.length === 0) return
    setIsBulkPending(true)
    try {
      const res = await bulkUpdateUserRoles(selectedUserIds, role)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success(`Updated role to ${role} for ${res.successCount} user(s)`)
        setRowSelection({})
        retry()
      }
    } catch {
      toast.error('Failed to update roles')
    } finally {
      setIsBulkPending(false)
    }
  }

  function handleSortChangeWithTranslation(column: string | null, order: 'asc' | 'desc' | null) {
    if (column === null || order === null) {
      handleSortChange(null, null)
      return
    }

    const columnMapping: Record<string, string> = {
      user: 'username',
      email: 'email',
      created: 'created_at',
    }

    const dbFieldName = columnMapping[column] || column
    handleSortChange(dbFieldName, order)
  }

  const bulkToolbarContent = selectedUserIds.length > 0 ? (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        {selectedUserIds.length} {t('selected')}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={isBulkPending}
        onClick={() => handleBulkBlock(true)}
        className="h-8 text-xs text-destructive hover:bg-destructive/10"
      >
        <LockIcon className="mr-1 size-3.5" />
        {t('Block Selected')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={isBulkPending}
        onClick={() => handleBulkBlock(false)}
        className="h-8 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
      >
        <UnlockIcon className="mr-1 size-3.5" />
        {t('Unblock Selected')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isBulkPending} className="h-8 text-xs">
            <ShieldIcon className="mr-1 size-3.5" />
            {t('Assign Role')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {USER_ROLES.map(role => (
            <DropdownMenuItem key={role} onSelect={() => handleBulkRole(role)} className="text-xs">
              {role.toLowerCase()}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ) : null

  const filterToolbarContent = (
    <div className="flex items-center gap-2">
      <select
        value={statusFilter}
        onChange={e => setStatusFilter(e.target.value as any)}
        className="h-8 rounded-md border bg-background px-2.5 text-xs text-foreground outline-none"
      >
        <option value="all">{t('All Statuses')}</option>
        <option value="blocked">{t('Blocked Only')}</option>
        <option value="allowed">{t('Allowed Only')}</option>
      </select>
      <select
        value={roleFilter}
        onChange={e => setRoleFilter(e.target.value)}
        className="h-8 rounded-md border bg-background px-2.5 text-xs text-foreground outline-none"
      >
        <option value="all">{t('All Roles')}</option>
        {USER_ROLES.map(r => (
          <option key={r} value={r}>
            {r.toLowerCase()}
          </option>
        ))}
      </select>
    </div>
  )

  const combinedToolbarLeft = (
    <div className="flex flex-wrap items-center gap-3">
      {filterToolbarContent}
      {bulkToolbarContent}
    </div>
  )

  return (
    <DataTable
      columns={columns}
      data={filteredUsers}
      totalCount={totalCount}
      searchPlaceholder={t('Search users...')}
      enableSelection={true}
      rowSelection={rowSelection}
      onRowSelectionChange={setRowSelection}
      toolbarLeftContent={combinedToolbarLeft}
      enablePagination={true}
      enableColumnVisibility={true}
      isLoading={isLoading}
      error={error}
      onRetry={retry}
      emptyMessage={t('No users found')}
      emptyDescription={t('There are no users in the system yet.')}
      search={search}
      onSearchChange={handleSearchChange}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSortChange={handleSortChangeWithTranslation}
      pageIndex={pageIndex}
      pageSize={pageSize}
      onPageChange={handlePageChange}
      onPageSizeChange={handlePageSizeChange}
    />
  )
}
