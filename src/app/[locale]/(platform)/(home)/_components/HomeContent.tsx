import type { SupportedLocale } from '@/i18n/locales'
import type { Event, HomeFeaturedEventCard, HomeFeaturedHotTopic, HomeFeaturedSideCardSettings } from '@/types'
import HomeClient from '@/app/[locale]/(platform)/(home)/_components/HomeClient'
import { listHomeEventsPage } from '@/lib/home-events-page'
import { getHomeFeaturedSideCard, listHomeFeaturedEvents, listHomeFeaturedHotTopics } from '@/lib/home-featured-events'
import { DEFAULT_HOME_FEATURED_SETTINGS } from '@/lib/home-featured-settings'
import { getInitialHomeEventsSortBy } from '@/lib/home-route-sort'
import { resolveDisplayPrice } from '@/lib/market-chance'

interface HomeContentProps {
  locale: string
  currentTimestamp?: number | null
  initialTag?: string
  initialMainTag?: string
}

function resolveFallbackMarketChance(event: Event) {
  const market = event.markets[0]
  if (!market) {
    return 50
  }

  if (typeof market.price === 'number' && Number.isFinite(market.price)) {
    return Math.max(0, Math.min(100, market.price * 100))
  }

  const yesOutcome = market.outcomes[0]
  const yesPrice = resolveDisplayPrice({
    bid: yesOutcome?.sell_price ?? null,
    ask: yesOutcome?.buy_price ?? null,
    lastTrade: null,
  })

  return yesPrice == null ? 50 : Math.max(0, Math.min(100, yesPrice * 100))
}



const DEFAULT_FALLBACK_HOT_TOPICS: HomeFeaturedHotTopic[] = [
  { label: 'World', slug: 'world', href: '/world', volume24h: 0 },
  { label: 'Sports', slug: 'sports', href: '/sports', volume24h: 0 },
  { label: 'Crypto', slug: 'crypto', href: '/crypto', volume24h: 0 },
  { label: 'Politics', slug: 'politics', href: '/politics', volume24h: 0 },
]

function buildFallbackHotTopics(events: Event[]): HomeFeaturedHotTopic[] {
  const topicsMap = new Map<string, {
    label: string
    slug: string
    href: string
    tradersCount: number
    volume24h: number
  }>()

  for (const event of events) {
    const tagToUse = event.tags.find(tag => tag.isMainCategory) || event.tags[0]
    const rawSlug = tagToUse?.slug || event.main_tag || ''
    const slug = rawSlug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    if (!slug) {
      continue
    }

    const eventTraders = event.markets.reduce((sum, market) => {
      return sum + Number((market as any).unique_traders ?? (market as any).traders_count ?? 0)
    }, 0)

    const eventVolume = event.markets.reduce((sum, market) => {
      const recentVolume = Number(market.volume_24h ?? 0)
      const totalVolume = Number(market.volume ?? 0)
      return sum + (recentVolume > 0 ? recentVolume : totalVolume > 0 ? totalVolume : 0)
    }, 0)

    const existing = topicsMap.get(slug)
    topicsMap.set(slug, {
      label: existing?.label || tagToUse?.name || event.main_tag || slug,
      slug,
      href: `/${slug}`,
      tradersCount: (existing?.tradersCount ?? 0) + eventTraders,
      volume24h: (existing?.volume24h ?? 0) + (eventVolume > 0 ? eventVolume : (event.volume ?? 0)),
    })
  }



  return Array.from(topicsMap.values())
    .sort((left, right) => {
      if (left.tradersCount !== right.tradersCount) {
        return right.tradersCount - left.tradersCount
      }
      if (left.volume24h !== right.volume24h) {
        return right.volume24h - left.volume24h
      }
      return left.slug.localeCompare(right.slug)
    })
    .slice(0, 3)
    .map(({ tradersCount: _t, ...topic }) => topic)
}

function mergeHotTopics(
  primary: HomeFeaturedHotTopic[],
  fallback: HomeFeaturedHotTopic[],
): HomeFeaturedHotTopic[] {
  const merged = [...primary]
  const seen = new Set(primary.map(topic => topic.slug))

  for (const topic of fallback) {
    if (!seen.has(topic.slug)) {
      merged.push(topic)
      seen.add(topic.slug)
    }
    if (merged.length >= 5) {
      break
    }
  }

  return merged.slice(0, 3)
}

export default async function HomeContent({
  locale,
  currentTimestamp = null,
  initialTag,
  initialMainTag,
}: HomeContentProps) {
  const resolvedLocale = locale as SupportedLocale
  const initialTagSlug = initialTag ?? 'trending'
  const initialMainTagSlug = initialMainTag ?? initialTagSlug
  const shouldLoadFeaturedEvents = initialTagSlug === 'trending' && initialMainTagSlug === 'trending'
  const initialSortBy = getInitialHomeEventsSortBy(initialTagSlug)
  let initialCurrentTimestamp: number | null = null

  let initialEvents: Event[] = []
  let initialFeaturedEvents: HomeFeaturedEventCard[] = []
  let initialFeaturedHotTopics: HomeFeaturedHotTopic[] = []
  let initialFeaturedSideCard: HomeFeaturedSideCardSettings = DEFAULT_HOME_FEATURED_SETTINGS.sideCard

  const initialEventsPromise = listHomeEventsPage({
    tag: initialTagSlug,
    mainTag: initialMainTagSlug,
    search: '',
    userId: '',
    bookmarked: false,
    locale: resolvedLocale,
    currentTimestamp,
    ...(initialSortBy && { sortBy: initialSortBy }),
  })
    .then(({ data: events, error, currentTimestamp: resolvedCurrentTimestamp }) => ({
      events: error ? [] : events ?? [],
      currentTimestamp: resolvedCurrentTimestamp ?? null,
    }))
    .catch((error) => {
      console.error('Failed to load initial home events', error)
      return { events: [], currentTimestamp: null }
    })

  const featuredEventsPromise = shouldLoadFeaturedEvents
    ? (async () => {
        try {
          const [featuredEvents, featuredHotTopics] = await Promise.all([
            listHomeFeaturedEvents(resolvedLocale),
            listHomeFeaturedHotTopics(resolvedLocale),
          ])
          const featuredSideCard = await getHomeFeaturedSideCard(featuredEvents, featuredHotTopics)

          return {
            featuredEvents,
            featuredHotTopics,
            featuredSideCard,
          }
        }
        catch (error) {
          console.error('Failed to load home featured events', error)
          return {
            featuredEvents: [],
            featuredHotTopics: [],
            featuredSideCard: DEFAULT_HOME_FEATURED_SETTINGS.sideCard,
          }
        }
      })()
    : Promise.resolve({
        featuredEvents: [],
        featuredHotTopics: [],
        featuredSideCard: DEFAULT_HOME_FEATURED_SETTINGS.sideCard,
      })

  const [initialEventsResult, featuredEventsResult] = await Promise.all([
    initialEventsPromise,
    featuredEventsPromise,
  ])

  initialEvents = initialEventsResult.events
  initialCurrentTimestamp = initialEventsResult.currentTimestamp
  initialFeaturedEvents = featuredEventsResult.featuredEvents
  initialFeaturedHotTopics = mergeHotTopics(
    featuredEventsResult.featuredHotTopics,
    buildFallbackHotTopics(initialEvents),
  )
  initialFeaturedSideCard = featuredEventsResult.featuredSideCard

  return (
    <main className="container grid gap-4 py-4">
      <HomeClient
        initialFeaturedEvents={initialFeaturedEvents}
        initialFeaturedHotTopics={initialFeaturedHotTopics}
        initialFeaturedSideCard={initialFeaturedSideCard}
        initialEvents={initialEvents}
        initialCurrentTimestamp={initialCurrentTimestamp}
        initialTag={initialTagSlug}
        initialMainTag={initialMainTagSlug}
      />
    </main>
  )
}
