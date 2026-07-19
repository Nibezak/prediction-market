import type { SupportedLocale } from '@/i18n/locales'
import { getExtracted, setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import AdminEventsTable from '@/app/[locale]/admin/events/_components/AdminEventsTable'
import { Skeleton } from '@/components/ui/skeleton'
import { TagRepository } from '@/lib/db/queries/tag'

import { loadAutoDeployNewEventsEnabled } from '@/lib/event-sync-settings'
import { UserRepository } from '@/lib/db/queries/user'
import { getUserPlatformRole } from '@/lib/staff-role'

function AdminEventsTableFallback() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-full sm:max-w-sm" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-36" />
        </div>
      </div>
      <div className="space-y-3 rounded-md border p-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}

export default async function AdminEventsPage({ params }: PageProps<'/[locale]/admin/events'>) {
  const { locale } = await params
  setRequestLocale(locale)
  const resolvedLocale = locale as SupportedLocale
  const t = await getExtracted()
  const [autoDeployNewEventsEnabled, mainTagsResult, currentUser] = await Promise.all([
    loadAutoDeployNewEventsEnabled(),
    TagRepository.getMainTags(resolvedLocale),
    UserRepository.getCurrentUser({ minimal: true }),
  ])
  const role = getUserPlatformRole(currentUser)
  const mainCategoryOptions = (mainTagsResult.data ?? []).map(tag => ({
    slug: tag.slug,
    name: tag.name,
  }))

  return (
    <section className="grid gap-4">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">{t('Events')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('Manage event visibility, inspect volume, and control how new synced events are deployed.')}
        </p>
      </div>
      <div className="min-w-0">
        <Suspense fallback={<AdminEventsTableFallback />}>
          <AdminEventsTable
            initialAutoDeployNewEventsEnabled={autoDeployNewEventsEnabled}
            mainCategoryOptions={mainCategoryOptions}
            role={role}
          />
        </Suspense>
      </div>
    </section>
  )
}
