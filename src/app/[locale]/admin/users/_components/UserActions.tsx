'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Ban, MoreHorizontal, ShieldCheck } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { Button } from '@/components/ui/button'
import AppLink from '@/components/AppLink'
import { useUser } from '@/stores/useUser'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toggleUserBlockedStatus, updateUserRole } from '@/app/[locale]/admin/users/_actions/update-user-status'
import { toast } from 'sonner'

interface UserActionsProps {
  user: {
    id: string
    username: string
    email: string
    is_blocked?: boolean
    role?: string
  }
}

export function UserActions({ user }: UserActionsProps) {
  const t = useExtracted()
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const isBlocked = !!user.is_blocked
  const currentUser = useUser()
  const canManage = currentUser?.is_admin === true || currentUser?.role === 'ADMIN'

  const handleToggleBlock = async () => {
    setIsLoading(true)
    try {
      const result = await toggleUserBlockedStatus(user.id, !isBlocked)
      if (result.error) {
        toast.error(t('Error'), {
          description: result.error,
        })
      } else {
        toast.success(t('Success'), {
          description: isBlocked 
            ? t('User has been unblocked.') 
            : t('User has been blocked from trading.'),
        })
        setIsDialogOpen(false)
        await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      }
    } catch (error) {
      toast.error(t('Error'), {
        description: t('An unexpected error occurred.'),
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleRoleChange = async (role: 'USER' | 'EDITOR' | 'MODERATOR' | 'RESOLVER' | 'SUPPORT' | 'FINANCE') => {
    setIsLoading(true)
    const result = await updateUserRole(user.id, role)
    setIsLoading(false)
    if (result.error) {
      toast.error(t('Error'), { description: result.error })
      return
    }
    toast.success(t('Success'), { description: t('User role updated.') })
    await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">{t('Open menu')}</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <AppLink href={`/@${user.username}` as any}>View account</AppLink>
          </DropdownMenuItem>
          {canManage && (['USER', 'EDITOR', 'MODERATOR', 'RESOLVER', 'SUPPORT', 'FINANCE'] as const).map(role => (
            <DropdownMenuItem key={role} disabled={isLoading || user.role === role} onSelect={() => void handleRoleChange(role)}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              {t('Set role: {role}', { role: role.toLowerCase() })}
            </DropdownMenuItem>
          ))}
          {canManage && <DropdownMenuItem 
            className="text-destructive cursor-pointer" 
            onSelect={() => setIsDialogOpen(true)}
          >
            <Ban className="mr-2 h-4 w-4" />
            {isBlocked ? t('Unblock User') : t('Block User')}
          </DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isBlocked ? t('Unblock User') : t('Block User')}</DialogTitle>
            <DialogDescription>
              {isBlocked 
                ? t('Are you sure you want to unblock {user}? They will be able to trade again.', { user: user.username || user.email })
                : t('Are you sure you want to block {user}? They will no longer be able to trade.', { user: user.username || user.email })
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isLoading}>
              {t('Cancel')}
            </Button>
            <Button variant={isBlocked ? 'default' : 'destructive'} onClick={handleToggleBlock} disabled={isLoading}>
              {isLoading ? t('Saving...') : (isBlocked ? t('Unblock') : t('Block'))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
