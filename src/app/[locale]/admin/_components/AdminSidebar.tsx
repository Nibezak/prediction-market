'use client'

import type { LucideIcon } from 'lucide-react'
import type { Route } from 'next'
import {
  BadgePercentIcon,
  CalendarIcon,
  LanguagesIcon,
  SettingsIcon,
  SwatchBookIcon,
  TagsIcon,
  TextSelectIcon,
  UsersIcon,
  PlusIcon,
  PaintbrushIcon,
} from 'lucide-react'
import { useExtracted } from 'next-intl'
import AppLink from '@/components/AppLink'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

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

export default function AdminSidebar() {
  const t = useExtracted()
  
  const adminMenuItems: AdminMenuItem[] = [
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
        { id: 'create-event', label: t('Create Event'), href: '/admin/events/create' as Route, icon: PlusIcon },
      ]
    },
    { id: 'users', label: t('Users'), href: '/admin/users' as Route, icon: UsersIcon },
  ]
  
  const pathname = usePathname()
  
  const activeItem = adminMenuItems.find((item) => {
    return pathname === item.href || pathname.startsWith(`${item.href}/`)
  })
  
  const active = pathname.startsWith('/admin/events/calendar')
    ? 'events'
    : (activeItem?.id ?? 'settings')

  return (
    <aside className="min-w-0 bg-background rounded-lg border shadow-sm p-4 lg:sticky lg:top-[5.5rem] lg:self-start lg:h-[calc(100vh-6.5rem)] overflow-y-auto">
      <nav
        className={cn(`
          flex w-full max-w-full snap-x snap-mandatory gap-2 overflow-x-auto rounded-sm
          lg:grid lg:gap-2 lg:overflow-visible lg:rounded-none lg:bg-transparent
        `)}
      >
        <Accordion type="multiple" defaultValue={[active]} className="w-full space-y-1">
          {adminMenuItems.map(item => {
            const isActive = active === item.id
            
            if (item.subItems && item.subItems.length > 0) {
              return (
                <AccordionItem value={item.id} key={item.id} className="border-none">
                  <AccordionTrigger
                    className={cn(
                      `hover:no-underline hover:bg-accent/50 rounded-md px-3 py-2 flex items-center justify-between transition-colors`,
                      { 'bg-accent/30 font-medium': isActive }
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className={cn("size-5", isActive ? "text-primary" : "text-muted-foreground")} />
                      <span className={cn(isActive ? "text-foreground" : "text-muted-foreground")}>{item.label}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-1 pb-0 pl-10 pr-0 space-y-1">
                    {item.subItems.map(subItem => {
                      const isSubActive = pathname === subItem.href
                      return (
                        <Button
                          key={subItem.id}
                          type="button"
                          variant="ghost"
                          className={cn(
                            `w-full justify-start h-9 px-3 gap-2 text-sm transition-colors`,
                            { 'bg-accent font-medium text-foreground': isSubActive, 'text-muted-foreground': !isSubActive }
                          )}
                          asChild
                        >
                          <AppLink intentPrefetch href={subItem.href}>
                            {subItem.icon && <subItem.icon className="size-4" />}
                            <span>{subItem.label}</span>
                          </AppLink>
                        </Button>
                      )
                    })}
                  </AccordionContent>
                </AccordionItem>
              )
            }

            return (
              <AccordionItem value={item.id} key={item.id} className="border-none">
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    `
                      w-full h-auto flex-col gap-1.5 px-3 py-2.5 text-foreground justify-start
                      lg:h-11 lg:flex-row lg:gap-3 lg:px-3 lg:py-2
                    `,
                    { 'bg-accent font-medium': isActive, 'hover:bg-accent/50 text-muted-foreground hover:text-foreground': !isActive }
                  )}
                  asChild
                >
                  <AppLink intentPrefetch href={item.href}>
                    <item.icon className={cn("size-5", isActive ? "text-primary" : "text-muted-foreground")} />
                    <span>{item.label}</span>
                  </AppLink>
                </Button>
              </AccordionItem>
            )
          })}
        </Accordion>
      </nav>
    </aside>
  )
}
