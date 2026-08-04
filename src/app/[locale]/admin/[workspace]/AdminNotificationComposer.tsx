'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

type AudienceUser = { id: string, username: string | null, email: string }
type TriState = 'any' | 'yes' | 'no'

const roles = ['USER', 'EDITOR', 'MODERATOR', 'RESOLVER', 'SUPPORT', 'FINANCE', 'ADMIN', 'SUPER_ADMIN'] as const

function splitList(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function triState(value: TriState) {
  return value === 'any' ? null : value === 'yes'
}

export default function AdminNotificationComposer({ users }: { users: AudienceUser[] }) {
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [remoteUsers, setRemoteUsers] = useState<AudienceUser[]>([])
  const [includeIds, setIncludeIds] = useState<string[]>([])
  const [excludeIds, setExcludeIds] = useState<string[]>([])
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [hasTraded, setHasTraded] = useState<TriState>('any')
  const [hasWon, setHasWon] = useState<TriState>('any')
  const [hasDeposited, setHasDeposited] = useState<TriState>('any')
  useEffect(() => {
    if (search.trim().length < 2) {
      setRemoteUsers([])
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void fetch(`/api/admin/notifications/campaigns?q=${encodeURIComponent(search.trim())}`, { signal: controller.signal })
        .then(response => response.ok ? response.json() : null)
        .then(payload => setRemoteUsers(Array.isArray(payload?.users) ? payload.users : []))
        .catch(() => undefined)
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [search])
  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase()
    const candidates = [...remoteUsers, ...users]
    const unique = [...new Map(candidates.map(user => [user.id, user])).values()]
    return query ? unique.filter(user => `${user.username || ''} ${user.email}`.toLowerCase().includes(query)) : unique.slice(0, 12)
  }, [remoteUsers, search, users])

  function toggleId(id: string, kind: 'include' | 'exclude') {
    const setter = kind === 'include' ? setIncludeIds : setExcludeIds
    const otherSetter = kind === 'include' ? setExcludeIds : setIncludeIds
    setter(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
    otherSetter(current => current.filter(value => value !== id))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const form = new FormData(event.currentTarget)
    const scheduledValue = String(form.get('scheduledFor') || '').trim()
    const payload = {
      title: String(form.get('title') || ''),
      body: String(form.get('body') || ''),
      category: String(form.get('category') || 'platform'),
      linkUrl: String(form.get('linkUrl') || ''),
      useAiCopy: form.get('useAiCopy') === 'on',
      scheduledFor: scheduledValue ? new Date(scheduledValue).toISOString() : null,
      criteria: {
        includeUserIds: includeIds,
        excludeUserIds: excludeIds,
        includeCountries: splitList(String(form.get('includeCountries') || '')),
        excludeCountries: splitList(String(form.get('excludeCountries') || '')),
        roles: selectedRoles,
        currencies: form.getAll('currencies'),
        hasTraded: triState(hasTraded),
        hasWon: triState(hasWon),
        hasDeposited: triState(hasDeposited),
        activeWithinDays: form.get('activeWithinDays') ? Number(form.get('activeWithinDays')) : null,
        inactiveForDays: form.get('inactiveForDays') ? Number(form.get('inactiveForDays')) : null,
        signedUpAfter: form.get('signedUpAfter') ? new Date(String(form.get('signedUpAfter'))).toISOString() : null,
        signedUpBefore: form.get('signedUpBefore') ? new Date(String(form.get('signedUpBefore'))).toISOString() : null,
        pushEnabledOnly: form.get('pushEnabledOnly') === 'on',
      },
    }
    try {
      const response = await fetch('/api/admin/notifications/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Could not create the notification campaign.')
      toast.success(scheduledValue ? `Notification scheduled for ${result.audienceCount} users.` : `Notification sent to ${result.audienceCount} users.`)
      event.currentTarget.reset()
      setIncludeIds([])
      setExcludeIds([])
      setSelectedRoles([])
      setHasTraded('any')
      setHasWon('any')
      setHasDeposited('any')
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the notification campaign.')
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-8">
      <section className="grid gap-4 border-b pb-8">
        <div>
          <h2 className="text-lg font-semibold">Compose notification</h2>
          <p className="text-sm text-muted-foreground">Create an in-app notification and deliver it to opted-in devices.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2"><Label htmlFor="campaign-title">Title</Label><Input id="campaign-title" name="title" maxLength={80} required /></div>
          <div className="grid gap-2"><Label htmlFor="campaign-category">Category</Label><Select name="category" defaultValue="platform"><SelectTrigger id="campaign-category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="platform">Platform</SelectItem><SelectItem value="money">Money</SelectItem><SelectItem value="market">Markets</SelectItem><SelectItem value="community">Community</SelectItem><SelectItem value="security">Security</SelectItem></SelectContent></Select></div>
        </div>
        <div className="grid gap-2"><Label htmlFor="campaign-body">Message</Label><Textarea id="campaign-body" name="body" maxLength={240} rows={3} required /></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2"><Label htmlFor="campaign-link">Internal link</Label><Input id="campaign-link" name="linkUrl" placeholder="/portfolio" /></div>
          <div className="grid gap-2"><Label htmlFor="campaign-schedule">Schedule</Label><Input id="campaign-schedule" name="scheduledFor" type="datetime-local" /></div>
        </div>
        <div className="flex items-center justify-between gap-4 border-t pt-4"><div><Label htmlFor="ai-copy">Refine copy with AI</Label><p className="text-xs text-muted-foreground">Facts and links remain unchanged. Original copy is used if AI is unavailable.</p></div><Switch id="ai-copy" name="useAiCopy" defaultChecked /></div>
      </section>

      <section className="grid gap-5 border-b pb-8">
        <div><h2 className="text-lg font-semibold">Audience</h2><p className="text-sm text-muted-foreground">Filters combine with AND. Empty fields include everyone.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2"><Label htmlFor="include-countries">Only countries</Label><Input id="include-countries" name="includeCountries" placeholder="Kenya, Uganda" /></div>
          <div className="grid gap-2"><Label htmlFor="exclude-countries">Exclude countries</Label><Input id="exclude-countries" name="excludeCountries" placeholder="Nigeria, Ghana" /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {([['Traded', hasTraded, setHasTraded], ['Won', hasWon, setHasWon], ['Deposited', hasDeposited, setHasDeposited]] as const).map(([label, value, setter]) => (
            <div key={label} className="grid gap-2"><Label>{label}</Label><Select value={value} onValueChange={next => setter(next as TriState)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Any</SelectItem><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent></Select></div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-2"><Label htmlFor="active-days">Active within days</Label><Input id="active-days" name="activeWithinDays" type="number" min={1} max={365} /></div>
          <div className="grid gap-2"><Label htmlFor="inactive-days">Inactive for days</Label><Input id="inactive-days" name="inactiveForDays" type="number" min={1} max={365} /></div>
          <div className="grid gap-2"><Label htmlFor="signed-after">Signed up after</Label><Input id="signed-after" name="signedUpAfter" type="date" /></div>
          <div className="grid gap-2"><Label htmlFor="signed-before">Signed up before</Label><Input id="signed-before" name="signedUpBefore" type="date" /></div>
        </div>
        <div className="grid gap-3"><Label>Roles</Label><div className="flex flex-wrap gap-x-5 gap-y-3">{roles.map(role => <label key={role} className="flex items-center gap-2 text-sm"><Checkbox checked={selectedRoles.includes(role)} onCheckedChange={() => setSelectedRoles(current => current.includes(role) ? current.filter(item => item !== role) : [...current, role])} />{role.replace('_', ' ')}</label>)}</div></div>
        <div className="flex flex-wrap gap-6"><label className="flex items-center gap-2 text-sm"><Checkbox name="currencies" value="KES" />KES users</label><label className="flex items-center gap-2 text-sm"><Checkbox name="currencies" value="USD" />USD users</label><label className="flex items-center gap-2 text-sm"><Checkbox name="pushEnabledOnly" />Push-enabled users only</label></div>
      </section>

      <section className="grid gap-4 border-b pb-8">
        <div><h2 className="text-lg font-semibold">Include or exclude people</h2><p className="text-sm text-muted-foreground">Search is case-insensitive. Included users form a strict allowlist.</p></div>
        <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or email" />
        <div className="max-h-72 divide-y overflow-y-auto border">
          {visibleUsers.map(user => <div key={user.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 p-3"><div className="min-w-0"><div className="truncate text-sm font-medium">{user.username || 'No username'}</div><div className="truncate text-xs text-muted-foreground">{user.email}</div></div><label className="flex items-center gap-2 text-xs"><Checkbox checked={includeIds.includes(user.id)} onCheckedChange={() => toggleId(user.id, 'include')} />Include</label><label className="flex items-center gap-2 text-xs"><Checkbox checked={excludeIds.includes(user.id)} onCheckedChange={() => toggleId(user.id, 'exclude')} />Exclude</label></div>)}
        </div>
      </section>

      <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy ? 'Preparing...' : 'Send or schedule'}</Button></div>
    </form>
  )
}
