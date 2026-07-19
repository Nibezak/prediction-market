'use client'

import type { LucideIcon } from 'lucide-react'
import type { Route } from 'next'
import { BadgePercentIcon, BellIcon, CoinsIcon, FingerprintIcon, UserIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import AppLink from '@/components/AppLink'
import { Button } from '@/components/ui/button'
import { usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

interface MenuItem {
  id: string
  label: string
  href: Route
  icon: LucideIcon
}

export default function SettingsSidebar() {
  const t = useExtracted()
  const pathname = usePathname()
  const menuItems: MenuItem[] = [
    { id: 'profile', label: t('Profile'), href: '/settings' as Route, icon: UserIcon },
    { id: 'account', label: t('Account'), href: '/settings/account' as Route, icon: FingerprintIcon },
    { id: 'notifications', label: t('Notifications'), href: '/settings/notifications' as Route, icon: BellIcon },
    { id: 'trading', label: t('Trading'), href: '/settings/trading' as Route, icon: CoinsIcon },
    { id: 'affiliate', label: t('Affiliate'), href: '/settings/affiliate' as Route, icon: BadgePercentIcon },
  ]
  const activeItem = menuItems.find(item => pathname === item.href)
  const active = activeItem?.id ?? 'profile'

  return (
    <nav
      className={cn(`
        scrollbar-hide flex w-full max-w-full snap-x snap-mandatory gap-2 overflow-x-auto rounded-sm
        lg:grid lg:gap-2 lg:overflow-visible lg:rounded-none lg:bg-transparent
      `)}
    >
      {menuItems.map((item) => {
        const isActive = active === item.id
        return (
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            className={cn(
              `
                h-auto shrink-0 snap-start flex-col gap-1.5 px-3 py-2 text-foreground
                lg:h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:py-2
              `,
              { 'bg-accent font-medium': isActive, 'text-muted-foreground hover:bg-accent/50 hover:text-foreground': !isActive },
            )}
            asChild
          >
            <AppLink intentPrefetch href={item.href}>
              <item.icon className={cn('size-6 lg:size-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
              <span>{item.label}</span>
            </AppLink>
          </Button>
        )
      })}
    </nav>
  )
}
