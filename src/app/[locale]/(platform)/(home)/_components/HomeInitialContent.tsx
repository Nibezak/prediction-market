import type { SupportedLocale } from '@/i18n/locales'
import { cacheLife, cacheTag } from 'next/cache'
import HomeContent from '@/app/[locale]/(platform)/(home)/_components/HomeContent'
import {
  getHomeInitialCurrentTimestamp,
  HOME_INITIAL_EVENTS_CACHE_LIFE,
} from '@/app/[locale]/(platform)/(home)/_utils/homeInitialEventsCache'
import { cacheTags } from '@/lib/cache-tags'
import { hasDatabaseEnv } from '@/lib/db/env'
import { deferPublicShellPrerenderIfNeeded, shouldPrerenderPublicShell } from '@/lib/public-shell-rendering'

interface HomeInitialContentProps {
  deferRuntimePrerender?: boolean
  initialMainTag?: string
  initialTag?: string
  locale: SupportedLocale
}

async function HomeInitialContentBody({
  initialMainTag,
  initialTag,
  locale,
  currentTimestamp,
}: HomeInitialContentProps & { currentTimestamp?: number | null }) {
  return (
    <HomeContent
      locale={locale}
      currentTimestamp={currentTimestamp}
      initialTag={initialTag}
      initialMainTag={initialMainTag}
    />
  )
}

async function CachedHomeInitialContent(props: HomeInitialContentProps) {
  'use cache'
  cacheLife(HOME_INITIAL_EVENTS_CACHE_LIFE)
  cacheTag(cacheTags.homeFeaturedEvents)
  cacheTag(cacheTags.settings)

  const currentTimestamp = getHomeInitialCurrentTimestamp()
  return <HomeInitialContentBody {...props} currentTimestamp={currentTimestamp} />
}

async function RuntimeHomeInitialContent(props: HomeInitialContentProps) {
  await deferPublicShellPrerenderIfNeeded()

  // Don't use cache when initialTag is provided (comes from route params)
  const shouldUseCache = hasDatabaseEnv() && !props.initialTag
  if (shouldUseCache) {
    return <CachedHomeInitialContent {...props} />
  }

  // For non-cached path, pass null timestamp to avoid Date.now() during prerender
  return <HomeInitialContentBody {...props} currentTimestamp={null} />
}

export default function HomeInitialContent({
  deferRuntimePrerender = true,
  ...props
}: HomeInitialContentProps) {
  if (shouldPrerenderPublicShell() || !deferRuntimePrerender) {
    // Don't use cache when initialTag is provided (comes from route params)
    const shouldUseCache = hasDatabaseEnv() && !props.initialTag
    if (shouldUseCache) {
      return <CachedHomeInitialContent {...props} />
    }

    // For non-cached path, pass null timestamp to avoid Date.now() during prerender
    return <HomeInitialContentBody {...props} currentTimestamp={null} />
  }

  return <RuntimeHomeInitialContent {...props} />
}
