'use client'

import type { Route } from 'next'
import type { ComponentType } from 'react'
import type { Notification } from '@/types'
import {
  BellIcon,
  ChartNoAxesColumnIncreasingIcon,
  ExternalLinkIcon,
  InfoIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
  WalletCardsIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import AppLink from '@/components/AppLink'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  useNotificationList,
  useNotifications,
  useNotificationsError,
  useNotificationsLoading,
  useUnreadNotificationCount,
} from '@/stores/useNotifications'

type ViewFilter = 'all' | 'unread' | 'recent'
type CanonicalCategory = 'trade' | 'finance' | 'account' | 'system' | 'general'
type CategoryFilter = 'all' | CanonicalCategory

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const CATEGORY_META: Record<CanonicalCategory, { label: string, icon: ComponentType<{ className?: string }> }> = {
  trade: { label: 'Trades', icon: ChartNoAxesColumnIncreasingIcon },
  finance: { label: 'Money', icon: WalletCardsIcon },
  account: { label: 'Account', icon: UserIcon },
  system: { label: 'System', icon: SettingsIcon },
  general: { label: 'General', icon: InfoIcon },
}

function canonicalCategory(category: string): CanonicalCategory {
  if (['trade', 'trading', 'market'].includes(category)) return 'trade'
  if (['finance', 'money', 'payment'].includes(category)) return 'finance'
  if (['account', 'authentication', 'user'].includes(category)) return 'account'
  if (['system', 'platform', 'administration', 'security'].includes(category)) return 'system'
  return 'general'
}

function notificationTarget(notification: Notification) {
  if (notification.link_target?.trim().startsWith('/')) return notification.link_target.trim()
  if (notification.link_url?.trim().startsWith('/')) return notification.link_url.trim()
  return null
}

function timeLabel(createdAt: string) {
  const timestamp = Date.parse(createdAt)
  if (!Number.isFinite(timestamp)) return ''
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(timestamp))
}

function NotificationRow({ notification }: { notification: Notification }) {
  const category = CATEGORY_META[canonicalCategory(notification.category)]
  const CategoryIcon = category.icon
  const internalTarget = notificationTarget(notification)
  const isExternal = notification.link_type === 'external' && Boolean(notification.link_url)
  const content = (
    <div className="flex min-w-0 items-start gap-3 px-3 py-4 sm:gap-4 sm:px-5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground sm:size-11">
        <CategoryIcon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground sm:text-base">{notification.title}</h2>
              {!notification.read_at && <span className="size-2 rounded-full bg-primary" aria-label="Unread" />}
            </div>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{notification.description}</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{timeLabel(notification.created_at)}</span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{category.label}</span>
          {notification.extra_info && <span className="truncate">· {notification.extra_info}</span>}
          {isExternal && <ExternalLinkIcon className="ml-auto size-3.5" />}
        </div>
      </div>
    </div>
  )

  if (internalTarget) {
    return <AppLink href={internalTarget as Route} className="block transition-colors hover:bg-accent/40">{content}</AppLink>
  }
  if (isExternal && notification.link_url) {
    return <a href={notification.link_url} target="_blank" rel="noreferrer noopener" className="block transition-colors hover:bg-accent/40">{content}</a>
  }
  return content
}

function NotificationSkeleton() {
  return (
    <div className="flex gap-3 px-3 py-4 sm:gap-4 sm:px-5">
      <Skeleton className="size-10 shrink-0 rounded-md sm:size-11" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  )
}

export default function NotificationsClient() {
  const notifications = useNotificationList()
  const unreadCount = useUnreadNotificationCount()
  const isLoading = useNotificationsLoading()
  const error = useNotificationsError()
  const setNotifications = useNotifications(state => state.setNotifications)
  const markAllRead = useNotifications(state => state.markAllRead)
  const [view, setView] = useState<ViewFilter>('all')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    void setNotifications()
  }, [setNotifications])

  const visibleNotifications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const recentCutoff = Date.now() - RECENT_WINDOW_MS
    return notifications.filter((notification) => {
      if (view === 'unread' && notification.read_at) return false
      const createdAt = Date.parse(notification.created_at)
      if (view === 'recent' && (!Number.isFinite(createdAt) || createdAt < recentCutoff)) return false
      if (category !== 'all' && canonicalCategory(notification.category) !== category) return false
      if (!normalizedQuery) return true
      return `${notification.title} ${notification.description} ${notification.extra_info ?? ''}`.toLowerCase().includes(normalizedQuery)
    })
  }, [category, notifications, query, view])

  return (
    <section className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Inbox</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">{unreadCount ? `${unreadCount} unread` : 'You are all caught up'}</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" size="sm" onClick={() => void markAllRead()} className="self-start sm:self-auto">
            Mark all as read
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 border-y border-border py-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 gap-1 overflow-x-auto pb-1 lg:pb-0">
          {(['all', 'unread', 'recent'] as const).map(option => (
            <Button
              key={option}
              size="sm"
              variant={view === option ? 'secondary' : 'ghost'}
              className="shrink-0 capitalize"
              onClick={() => setView(option)}
            >
              {option}
            </Button>
          ))}
        </div>
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem] lg:ml-auto lg:max-w-xl">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search notifications" className="pl-9" />
          </div>
          <Select value={category} onValueChange={value => setCategory(value as CategoryFilter)}>
            <SelectTrigger className="w-full"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {Object.entries(CATEGORY_META).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        {isLoading && notifications.length === 0 && <div className="divide-y divide-border">{Array.from({ length: 5 }, (_, index) => <NotificationSkeleton key={index} />)}</div>}
        {!isLoading && error && notifications.length === 0 && (
          <div className="px-4 py-16 text-center">
            <BellIcon className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-4 font-semibold">Notifications could not be loaded</h2>
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => void setNotifications()}>Try again</Button>
          </div>
        )}
        {!isLoading && !error && visibleNotifications.length === 0 && (
          <div className="px-4 py-16 text-center">
            <BellIcon className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-4 font-semibold">No notifications here</h2>
            <p className="mt-1 text-sm text-muted-foreground">Try another view or category.</p>
          </div>
        )}
        {visibleNotifications.length > 0 && (
          <div className={cn('divide-y divide-border', { 'opacity-70': isLoading })}>
            {visibleNotifications.map(notification => <NotificationRow key={notification.id} notification={notification} />)}
          </div>
        )}
      </div>
    </section>
  )
}
