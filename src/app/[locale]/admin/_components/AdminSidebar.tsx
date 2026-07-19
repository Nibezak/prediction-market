'use client'

import type { LucideIcon } from 'lucide-react'
import type { Route } from 'next'
import type { MouseEvent } from 'react'
import {
  BadgePercentIcon,
  BanknoteIcon,
  BellRingIcon,
  CalendarIcon,
  CheckCheckIcon,
  ClipboardCheckIcon,
  FileClockIcon,
  HeadphonesIcon,
  LanguagesIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  MonitorCogIcon,
  PaintbrushIcon,
  PlusIcon,
  ScanSearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SwatchBookIcon,
  TagsIcon,
  TextSelectIcon,
  UsersIcon,
} from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useEffect, useState } from 'react'
import AppLink from '@/components/AppLink'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { usePathname, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import type { PlatformRole } from '@/lib/staff-role'
import { ADMIN_WORKSPACES_BY_ROLE } from '@/lib/staff-role'

interface AdminSubMenuItem {
  id: string
  label: string
  href: Route
  icon?: LucideIcon
}

interface AdminMenuItem {
  id: string
  label: string
  href: Route
  icon: LucideIcon
  subItems?: AdminSubMenuItem[]
}

interface AdminMenuGroup {
  id: string
  label: string
  icon: LucideIcon
  itemIds: string[]
}

export default function AdminSidebar({ role }: { role: PlatformRole }) {
  const t = useExtracted()

  const allAdminMenuItems: AdminMenuItem[] = [
    { id: 'dashboard', label: t('Dashboard'), href: '/admin/dashboard' as Route, icon: LayoutDashboardIcon },
    { id: 'operations', label: t('Operations'), href: '/admin/operations' as Route, icon: ListChecksIcon },
    { id: 'market-review', label: t('Market Review'), href: '/admin/market-review' as Route, icon: ScanSearchIcon },
    { id: 'resolutions', label: t('Resolutions'), href: '/admin/resolutions' as Route, icon: CheckCheckIcon },
    { id: 'risk', label: t('Risk & Fraud'), href: '/admin/risk' as Route, icon: ShieldAlertIcon },
    { id: 'support', label: t('Support'), href: '/admin/support' as Route, icon: HeadphonesIcon },
    { id: 'finance', label: t('Finance & Ledger'), href: '/admin/finance' as Route, icon: BanknoteIcon },
    { id: 'approvals', label: t('Approvals'), href: '/admin/approvals' as Route, icon: ClipboardCheckIcon },
    { id: 'audit', label: t('Audit Log'), href: '/admin/audit' as Route, icon: FileClockIcon },
    { id: 'communications', label: t('Communications'), href: '/admin/communications' as Route, icon: BellRingIcon },
    { id: 'system', label: t('System Health'), href: '/admin/system' as Route, icon: MonitorCogIcon },
    { id: 'access-control', label: t('Access Control'), href: '/admin/access-control' as Route, icon: ShieldCheckIcon },
    { id: 'settings', label: t('Brand & Settings'), href: '/admin/settings' as Route, icon: PaintbrushIcon },
    { id: 'theme', label: t('Theme'), href: '/admin/theme' as Route, icon: SwatchBookIcon },
    { id: 'locales', label: t('Locales'), href: '/admin/locales' as Route, icon: LanguagesIcon },
    { id: 'categories', label: t('Categories'), href: '/admin/categories' as Route, icon: TagsIcon },
    { id: 'market-context', label: t('Market Context'), href: '/admin/market-context' as Route, icon: TextSelectIcon },
    { id: 'affiliate', label: t('Affiliate & Fees'), href: '/admin/affiliate' as Route, icon: BadgePercentIcon },
    {
      id: 'events',
      label: t('Events'),
      href: '/admin/events' as Route,
      icon: CalendarIcon,
      subItems: [
        { id: 'all-events', label: t('All Events'), href: '/admin/events' as Route },
        ...(['ADMIN', 'EDITOR'].includes(role)
          ? [{ id: 'create-event', label: t('Create Event'), href: '/admin/events/calendar/new' as Route, icon: PlusIcon }]
          : []),
      ],
    },
    { id: 'users', label: t('Users'), href: '/admin/users' as Route, icon: UsersIcon },
  ]

  const menuIdsByRole: Record<PlatformRole, string[]> = {
    ADMIN: allAdminMenuItems.map(item => item.id),
    EDITOR: ['dashboard', ...ADMIN_WORKSPACES_BY_ROLE.EDITOR, 'categories', 'market-context', 'events', 'users'],
    MODERATOR: ['dashboard', ...ADMIN_WORKSPACES_BY_ROLE.MODERATOR, 'events', 'users'],
    RESOLVER: ['dashboard', ...ADMIN_WORKSPACES_BY_ROLE.RESOLVER, 'events', 'users'],
    SUPPORT: ['dashboard', ...ADMIN_WORKSPACES_BY_ROLE.SUPPORT, 'users'],
    FINANCE: ['dashboard', ...ADMIN_WORKSPACES_BY_ROLE.FINANCE, 'events', 'users'],
    USER: [],
  }
  const adminMenuItems = allAdminMenuItems.filter(item => menuIdsByRole[role].includes(item.id))

  const menuGroups: AdminMenuGroup[] = [
    {
      id: 'markets',
      label: t('Markets'),
      icon: CalendarIcon,
      itemIds: ['events', 'market-review', 'resolutions', 'approvals', 'categories', 'market-context'],
    },
    {
      id: 'people-safety',
      label: t('P&S'),
      icon: ShieldCheckIcon,
      itemIds: ['users', 'risk', 'support', 'access-control'],
    },
    {
      id: 'operations-group',
      label: t('Operations'),
      icon: MonitorCogIcon,
      itemIds: ['operations', 'system', 'audit', 'communications'],
    },
    {
      id: 'finance-group',
      label: t('Finance'),
      icon: BanknoteIcon,
      itemIds: ['finance', 'affiliate'],
    },
    {
      id: 'configuration',
      label: t('Configuration'),
      icon: PaintbrushIcon,
      itemIds: ['settings', 'theme', 'locales'],
    },
  ]

  const pathname = usePathname()
  const router = useRouter()

  const navigateAdmin = (event: MouseEvent<HTMLAnchorElement>, href: Route) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    router.push(href)
  }

  const activeItem = adminMenuItems.find((item) => {
    return pathname === item.href || pathname.startsWith(`${item.href}/`)
  })

  const active = pathname.startsWith('/admin/events/calendar')
    ? 'events'
    : (activeItem?.id ?? 'settings')
  const activeGroup = menuGroups.find(group => group.itemIds.includes(active))?.id ?? ''
  const [openGroup, setOpenGroup] = useState(activeGroup)

  useEffect(() => {
    setOpenGroup(activeGroup)
  }, [activeGroup])

  const dashboardItem = adminMenuItems.find(item => item.id === 'dashboard')
  const visibleGroups = menuGroups
    .map(group => ({
      ...group,
      items: group.itemIds
        .map(id => adminMenuItems.find(item => item.id === id))
        .filter((item): item is AdminMenuItem => Boolean(item)),
    }))
    .filter(group => group.items.length > 0)

  return (
    <>
      {/* Mobile Horizontal Scrolling Nav */}
      <nav className="
        scrollbar-hide flex w-full max-w-full snap-x snap-mandatory gap-2 overflow-x-auto rounded-sm
        lg:hidden
      "
      >
        {adminMenuItems.map((item) => {
          const isActive = active === item.id
          return (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              className={cn(
                `h-auto shrink-0 snap-start flex-col gap-1.5 px-3 py-2 text-foreground`,
                { 'bg-accent hover:bg-accent': isActive },
              )}
              asChild
            >
              <AppLink href={item.href} onClick={event => navigateAdmin(event, item.href)}>
                <item.icon className="size-6 text-muted-foreground" />
                <span>{item.label}</span>
              </AppLink>
            </Button>
          )
        })}
      </nav>

      {/* Desktop Vertical Accordion Nav */}
      <nav className="hidden w-full gap-2 lg:grid lg:overflow-visible lg:bg-transparent">
        {dashboardItem && (
          <Button
            type="button"
            variant="ghost"
            className={cn(
              'h-11 w-full flex-row justify-start gap-3 px-3 py-2 text-foreground',
              { 'bg-accent font-medium': active === dashboardItem.id, 'text-muted-foreground hover:bg-accent/50 hover:text-foreground': active !== dashboardItem.id },
            )}
            asChild
          >
            <AppLink href={dashboardItem.href} onClick={event => navigateAdmin(event, dashboardItem.href)}>
              <dashboardItem.icon className={cn('size-5', active === dashboardItem.id ? 'text-primary' : 'text-muted-foreground')} />
              <span>{dashboardItem.label}</span>
            </AppLink>
          </Button>
        )}
        <Accordion type="single" collapsible value={openGroup} onValueChange={setOpenGroup} className="w-full space-y-1">
          {visibleGroups.map((group) => {
            const isGroupActive = group.id === activeGroup
            return (
              <AccordionItem value={group.id} key={group.id} className="border-none">
                <AccordionTrigger
                  className={cn(
                    'flex items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-accent/50 hover:no-underline',
                    { 'bg-accent/30 font-medium': isGroupActive },
                  )}
                >
                  <div className="flex items-center gap-3">
                    <group.icon className={cn('size-5', isGroupActive ? 'text-primary' : 'text-muted-foreground')} />
                    <span className={cn(isGroupActive ? 'text-foreground' : 'text-muted-foreground')}>{group.label}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-1 pt-1 pr-0 pb-0 pl-7">
                  {group.items.flatMap(item => [
                    { id: item.id, label: item.label, href: item.href, icon: item.icon },
                    ...(item.subItems ?? []).filter(subItem => subItem.href !== item.href),
                  ]).map((subItem) => {
                    const isSubActive = pathname === subItem.href
                      || (subItem.id !== 'events' && pathname.startsWith(`${subItem.href}/`))
                    const ItemIcon = subItem.icon
                    return (
                      <Button
                        key={subItem.id}
                        type="button"
                        variant="ghost"
                        className={cn(
                          'h-9 w-full justify-start gap-2 px-3 text-sm transition-colors',
                          { 'bg-accent font-medium text-foreground': isSubActive, 'text-muted-foreground': !isSubActive },
                        )}
                        asChild
                      >
                        <AppLink href={subItem.href} onClick={event => navigateAdmin(event, subItem.href)}>
                          {ItemIcon && <ItemIcon className="size-4" />}
                          <span>{subItem.label}</span>
                        </AppLink>
                      </Button>
                    )
                  })}
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      </nav>
    </>
  )
}
