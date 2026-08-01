'use client'

import { Loader2Icon, SearchIcon, ShieldCheckIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface AdminProposersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ProposerUser {
  id: string
  email: string
  username: string | null
  image: string | null
  role: string
  enabled: boolean
}

export default function AdminProposersDialog({ open, onOpenChange }: AdminProposersDialogProps) {
  const [users, setUsers] = useState<ProposerUser[]>([])
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    const controller = new AbortController()
    setIsLoading(true)
    fetch('/api/admin/resolution-proposers', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!response.ok || !Array.isArray(payload?.data)) {
          throw new Error(payload?.error || 'Failed to load users.')
        }
        setUsers(payload.data)
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        toast.error(error instanceof Error ? error.message : 'Failed to load users.')
      })
      .finally(() => setIsLoading(false))

    return () => controller.abort()
  }, [open])

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const sorted = users.toSorted((first, second) => Number(second.enabled) - Number(first.enabled))
    if (!normalized) return sorted
    return sorted.filter(user => (
      user.email.toLowerCase().includes(normalized)
      || user.username?.toLowerCase().includes(normalized)
      || user.role.toLowerCase().includes(normalized)
    ))
  }, [query, users])

  async function updateProposer(user: ProposerUser) {
    setPendingUserId(user.id)
    try {
      const response = await fetch('/api/admin/resolution-proposers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.id, enabled: !user.enabled }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Failed to update proposer access.')

      setUsers(current => current.map(item => (
        item.id === user.id ? { ...item, enabled: !item.enabled } : item
      )))
      toast.success(user.enabled ? 'Proposer access removed.' : 'Proposer access enabled.')
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update proposer access.')
    }
    finally {
      setPendingUserId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Resolution proposers</DialogTitle>
          <DialogDescription>
            Choose the staff members who can propose and resolve outcomes through the internal ledger.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search by name, email, or role"
            className="pl-9"
          />
        </div>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto">
          {isLoading
            ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  Loading users...
                </div>
              )
            : filteredUsers.map(user => (
                <div key={user.id} className="flex items-center justify-between gap-3 border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{user.username || user.email}</p>
                      <Badge variant="outline">{user.role}</Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={user.enabled ? 'secondary' : 'outline'}
                    disabled={pendingUserId === user.id}
                    onClick={() => void updateProposer(user)}
                  >
                    {pendingUserId === user.id
                      ? <Loader2Icon className="size-4 animate-spin" />
                      : <ShieldCheckIcon className="size-4" />}
                    {user.enabled ? 'Remove' : 'Allow'}
                  </Button>
                </div>
              ))}
          {!isLoading && filteredUsers.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No users found.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
