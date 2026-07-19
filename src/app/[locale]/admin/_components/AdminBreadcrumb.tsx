'use client'

import { ChevronRightIcon, HomeIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import AppLink from '@/components/AppLink'
import { usePathname } from '@/i18n/navigation'

export default function AdminBreadcrumb() {
  const pathname = usePathname()
  const t = useExtracted()

  // Example pathname: /admin/events/create
  const segments = pathname.split('/').filter(Boolean)

  // Generate breadcrumb links
  const breadcrumbs = segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join('/')}`

    // Format segment label (e.g. "market-context" -> "Market Context")
    const formattedLabel = segment
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')

    return {
      href,
      label: formattedLabel,
      isLast: index === segments.length - 1,
    }
  })

  // Only show inside admin panel, but maybe not on the root /admin if we want it cleaner
  // We'll show it everywhere inside /admin for consistency.
  if (segments[0] !== 'admin') { return null }

  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-6 hidden animate-in items-center text-sm text-muted-foreground/60 duration-500 fade-in md:flex"
    >
      <AppLink
        href="/admin/settings"
        className="flex items-center transition-colors hover:text-muted-foreground"
      >
        <HomeIcon className="size-4" />
        <span className="sr-only">{t('Dashboard')}</span>
      </AppLink>

      {breadcrumbs.slice(1).map((crumb, index) => (
        <div key={crumb.href} className="flex items-center">
          <ChevronRightIcon className="mx-1 size-3 opacity-40" />
          {crumb.isLast
            ? (
                <span className="text-muted-foreground/80" aria-current="page">
                  {crumb.label}
                </span>
              )
            : (
                <AppLink
                  href={crumb.href as any}
                  className="transition-colors hover:text-muted-foreground"
                >
                  {crumb.label}
                </AppLink>
              )}
        </div>
      ))}
    </nav>
  )
}
