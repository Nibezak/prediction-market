import type { SupportedLocale } from '@/i18n/locales'
import { getExtracted, setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import AdminEventsTable from '@/app/[locale]/admin/events/_components/AdminEventsTable'
import { TagRepository } from '@/lib/db/queries/tag'
import { loadAutoDeployNewEventsEnabled } from '@/lib/event-sync-settings'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function AdminEventsPage({ params }: PageProps<'/[locale]/admin/events'>) {
  const { locale } = await params
  setRequestLocale(locale)
  const resolvedLocale = locale as SupportedLocale
  const t = await getExtracted()
  const [autoDeployNewEventsEnabled, mainTagsResult] = await Promise.all([
    loadAutoDeployNewEventsEnabled(),
    TagRepository.getMainTags(resolvedLocale),
  ])
  const mainCategoryOptions = (mainTagsResult.data ?? []).map(tag => ({
    slug: tag.slug,
    name: tag.name,
  }))

  return (
    <Card className="shadow-sm border-muted/60">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">{t('Events')}</CardTitle>
        <CardDescription>
          {t('Manage event visibility, inspect volume, and control how new synced events are deployed.')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="min-w-0">
          <Suspense fallback={<div className="min-h-64 rounded-xl border bg-background" />}>
            <AdminEventsTable
              initialAutoDeployNewEventsEnabled={autoDeployNewEventsEnabled}
              mainCategoryOptions={mainCategoryOptions}
            />
          </Suspense>
        </div>
      </CardContent>
    </Card>
  )
}
