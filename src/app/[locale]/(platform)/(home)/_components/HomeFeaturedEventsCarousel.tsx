'use client'

import type { IconName } from 'lucide-react/dynamic'
import type { CSSProperties } from 'react'
import type {
  LinePickerMarketType,
  SportsGamesMarketType,
  SportsLinePickerOption,
} from '@/app/[locale]/(platform)/sports/_components/_sports-games-center/sports-games-center-types'
import type { SportsGamesButton, SportsGamesCard } from '@/app/[locale]/(platform)/sports/_utils/sports-games-data'
import type {
  HomeFeaturedContextItem,
  HomeFeaturedEventCard,
  HomeFeaturedHotTopic,
  HomeFeaturedOutcomeSummary,
  HomeFeaturedSideCardSettings,
  Market,
} from '@/types'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FlameIcon,
} from 'lucide-react'
import { DynamicIcon } from 'lucide-react/dynamic'
import { useExtracted } from 'next-intl'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import EventBookmark from '@/app/[locale]/(platform)/event/[slug]/_components/EventBookmark'
import EventChart from '@/app/[locale]/(platform)/event/[slug]/_components/EventChart'
import EventMarketChannelProvider from '@/app/[locale]/(platform)/event/[slug]/_components/EventMarketChannelProvider'
import { shouldUseLiveSeriesChart } from '@/app/[locale]/(platform)/event/[slug]/_utils/eventLiveSeriesChartEligibility'
import { buildLinePickerOptions } from '@/app/[locale]/(platform)/sports/_components/_sports-games-center/sports-games-center-utils'
import {
  buildSportsGamesCards,
  resolveSportsGamesCardCollapsedMarketType,
} from '@/app/[locale]/(platform)/sports/_utils/sports-games-data'
import AppLink from '@/components/AppLink'
import EventIconImage from '@/components/EventIconImage'
import SiteLogoIcon from '@/components/SiteLogoIcon'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useSiteIdentity } from '@/hooks/useSiteIdentity'
import { ensureReadableTextColorOnDark } from '@/lib/color-contrast'
import { resolveEventPagePath } from '@/lib/events-routing'
import { formatVolume } from '@/lib/formatters'
import { resolveSportsTeamFallbackClassName } from '@/lib/sports-team-colors'
import { cn } from '@/lib/utils'
import { formatMarketChancePercent } from '@/lib/market-chance'
import { useUser } from '@/stores/useUser'

interface HomeFeaturedEventsCarouselProps {
  items: HomeFeaturedEventCard[]
  hotTopics: HomeFeaturedHotTopic[]
  sideCard: HomeFeaturedSideCardSettings
}

const HOME_FEATURED_CHART_HEIGHT = 292
const HOME_FEATURED_MOBILE_CHART_HEIGHT = 158
const HOME_FEATURED_FULL_CHART_HEIGHT = 332
const HOME_FEATURED_CHART_HEIGHT_OFFSET = 20
const HOME_FEATURED_LIVE_CHART_WIDTH_OFFSET = 24
type FeaturedSportsButtonTone = 'home' | 'away' | 'draw' | 'neutral'
interface FeaturedSportsButtonMarket {
  key: string
  conditionId: string
  label: string
  tone: FeaturedSportsButtonTone
  color: string | null
}

const HomeSportsGameGraph = dynamic(
  () => import('@/app/[locale]/(platform)/sports/_components/_sports-games-center/SportsGameGraph'),
  { ssr: false, loading: () => <div className="min-h-60 w-full md:min-h-[260px] lg:min-h-[280px]" /> },
)

const HomeEventLiveSeriesChart = dynamic(
  () => import('@/app/[locale]/(platform)/event/[slug]/_components/EventLiveSeriesChart'),
  { ssr: false, loading: () => <div className="min-h-60 w-full md:min-h-[260px] lg:min-h-[280px]" /> },
)

function useElementWidth<T extends HTMLElement>(enabled = true) {
  const [element, setElement] = useState<T | null>(null)

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (!enabled || !element) {
      return function noopElementWidthSubscription() {}
    }

    function notifyElementWidthChange() {
      onStoreChange()
    }

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', notifyElementWidthChange)

      return function removeElementWidthResizeListener() {
        window.removeEventListener('resize', notifyElementWidthChange)
      }
    }

    const observer = new ResizeObserver(notifyElementWidthChange)
    observer.observe(element)

    return function disconnectElementWidthObserver() {
      observer.disconnect()
    }
  }, [enabled, element])

  const getSnapshot = useCallback(() => {
    if (!enabled || !element) {
      return undefined
    }

    const nextWidth = Math.round(element.getBoundingClientRect().width)
    if (!Number.isFinite(nextWidth) || nextWidth <= 0) {
      return undefined
    }

    return nextWidth
  }, [enabled, element])

  const width = useSyncExternalStore(subscribe, getSnapshot, () => undefined)

  const ref = useCallback((node: T | null) => {
    if (!enabled) {
      setElement(currentElement => currentElement === null ? currentElement : null)
      return
    }

    setElement(currentElement => currentElement === node ? currentElement : node)
  }, [enabled])

  return [ref, width] as const
}

function formatChancePercent(chance: number) {
  return formatMarketChancePercent(chance)
}

function formatVolumeLabel(volume: number) {
  return `${formatVolume(volume)} Vol`
}

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ') ?? ''
}

function isNegativeOutcomeLabel(label: string) {
  const normalized = normalizeText(label)
  return /\b(?:no|down|below|lower|under)\b/.test(normalized)
}

function resolveNeutralSportsButtonAppearance() {
  return {
    className: `
      border border-button-outline-border bg-transparent text-muted-foreground
      hover:bg-secondary/80 hover:text-foreground
    `,
    style: undefined,
    backgroundClassName: undefined,
    backgroundStyle: undefined,
  }
}

function resolveSportsButtonAppearance(market: FeaturedSportsButtonMarket) {
  if (market.tone === 'draw') {
    return resolveNeutralSportsButtonAppearance()
  }

  if (market.tone === 'neutral') {
    const normalizedLabel = normalizeText(market.label)
    if (normalizedLabel.startsWith('u ') || normalizedLabel.includes(' under')) {
      return {
        className: 'group/team-button text-no hover:bg-transparent',
        style: undefined,
        backgroundClassName: 'bg-no',
        backgroundStyle: undefined,
      }
    }
    if (normalizedLabel.startsWith('o ') || normalizedLabel.includes(' over')) {
      return {
        className: 'group/team-button text-yes hover:bg-transparent',
        style: undefined,
        backgroundClassName: 'bg-yes',
        backgroundStyle: undefined,
      }
    }

    return {
      ...resolveNeutralSportsButtonAppearance(),
      className: 'border border-button-outline-border bg-transparent text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
    }
  }

  if (market.color) {
    const textColor = ensureReadableTextColorOnDark(market.color)

    return {
      className: 'group/team-button hover:bg-transparent',
      style: textColor ? { color: textColor } : undefined,
      backgroundClassName: undefined,
      backgroundStyle: { backgroundColor: market.color },
    }
  }

  return {
    className: 'group/team-button text-foreground hover:bg-transparent',
    style: undefined,
    backgroundClassName: resolveSportsTeamFallbackClassName(market.tone === 'home' ? 'team1' : 'team2'),
    backgroundStyle: undefined,
  }
}

function resolveSportsGraphSelection(card: SportsGamesCard): {
  selectedMarketType: SportsGamesMarketType
  selectedConditionId: string | null
} | null {
  const moneylineButton = card.buttons.find(button => button.marketType === 'moneyline')
  if (moneylineButton) {
    return {
      selectedMarketType: 'moneyline',
      selectedConditionId: null,
    }
  }

  const selectedMarketType = resolveSportsGamesCardCollapsedMarketType(card) ?? card.buttons[0]?.marketType
  if (!selectedMarketType) {
    return null
  }

  return {
    selectedMarketType,
    selectedConditionId: card.buttons.find(button => button.marketType === selectedMarketType)?.conditionId
      ?? card.defaultConditionId,
  }
}

function toTitleCase(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

function normalizePathSlug(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-') || null
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href)
}

function resolveFeaturedBreadcrumbItems(item: HomeFeaturedEventCard) {
  const event = item.event
  const mainCategory = event.tags.find(tag => tag.isMainCategory) ?? null
  const mainSlug = normalizePathSlug(mainCategory?.slug ?? null)
    ?? normalizePathSlug(event.main_tag)
    ?? (item.kind === 'sports' ? 'sports' : null)

  if (item.kind === 'sports') {
    const sportsBasePath = mainSlug === 'esports' ? '/esports' : '/sports'
    const sportsSlug = normalizePathSlug(event.sports_sport_slug)
    const sportHref = sportsSlug ? `${sportsBasePath}/${sportsSlug}/games` : sportsBasePath

    return [
      {
        label: mainCategory?.name || event.main_tag || (mainSlug === 'esports' ? 'Esports' : 'Sports'),
        href: sportsBasePath,
      },
      ...(sportsSlug
        ? [{ label: toTitleCase(sportsSlug), href: sportHref }]
        : []),
    ]
  }

  if (!mainSlug) {
    return []
  }

  const secondaryTag = event.tags.find(tag => !tag.isMainCategory && normalizePathSlug(tag.slug) !== mainSlug) ?? null
  const recurrence = normalizePathSlug(event.series_recurrence)
  const secondarySlug = normalizePathSlug(secondaryTag?.slug ?? null) ?? recurrence
  const secondaryLabel = secondaryTag?.name || (recurrence ? toTitleCase(recurrence) : null)

  return [
    {
      label: mainCategory?.name || event.main_tag || toTitleCase(mainSlug),
      href: `/${mainSlug}`,
    },
    ...(secondarySlug && secondaryLabel
      ? [{ label: secondaryLabel, href: `/${mainSlug}/${secondarySlug}` }]
      : []),
  ]
}

function FeaturedBreadcrumb({ items }: { items: Array<{ label: string, href: string }> }) {
  if (items.length === 0) {
    return null
  }

  return (
    <nav className="flex min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground md:gap-1.5 md:text-sm">
      {items.map((breadcrumbItem, index) => (
        <span key={`${breadcrumbItem.href}:${breadcrumbItem.label}`} className="flex min-w-0 items-center gap-1.5">
          {index > 0 && <span className="shrink-0 text-muted-foreground/60">·</span>}
          <AppLink
            intentPrefetch
            href={breadcrumbItem.href}
            className="truncate underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            {breadcrumbItem.label}
          </AppLink>
        </span>
      ))}
    </nav>
  )
}

function normalizeFeaturedSportsTitle(value: string) {
  return value
    .replace(/\s+-\s+more markets\s*$/i, '')
    .replace(/\bvs\.\s*/i, 'vs ')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolveFeaturedDisplayTitle(item: HomeFeaturedEventCard) {
  if (item.kind === 'sports') {
    const teams = item.event.sports_teams ?? []
    const [homeTeam, awayTeam] = teams
    if (homeTeam?.name && awayTeam?.name) {
      return `${homeTeam.name} vs ${awayTeam.name}`
    }

    return normalizeFeaturedSportsTitle(item.event.title)
  }

  return item.event.title
}

function FeaturedHeaderActions({
  event,
  className,
}: {
  event: HomeFeaturedEventCard['event']
  className?: string
}) {
  const t = useExtracted()
  const eventHref = resolveEventPagePath(event)

  return (
    <div className={cn('flex shrink-0 items-center gap-1 md:gap-2', className)}>
      <Button type="button" variant="ghost" size="icon" className="size-8 md:size-10" asChild aria-label={t('Open market')}>
        <AppLink intentPrefetch href={eventHref}>
          <ExternalLinkIcon className="size-4" />
        </AppLink>
      </Button>
      <div className="flex size-8 items-center justify-center md:size-10">
        <EventBookmark event={event} refreshStatusOnMount={false} />
      </div>
    </div>
  )
}

function FeaturedHeader({
  item,
  showActions = true,
}: {
  item: HomeFeaturedEventCard
  showActions?: boolean
}) {
  const event = item.event
  const eventHref = resolveEventPagePath(event)
  const breadcrumbItems = resolveFeaturedBreadcrumbItems(item)
  const displayTitle = resolveFeaturedDisplayTitle(item)

  return (
    <div className="flex min-w-0 items-start justify-between gap-2 md:gap-3">
      <div className="group/header flex min-w-0 flex-1 items-start gap-2 md:gap-3">
        {item.kind !== 'sports' && (
          <AppLink
            intentPrefetch
            href={eventHref}
            className="size-9 shrink-0 overflow-hidden rounded-lg bg-muted md:size-12"
          >
            <EventIconImage
              src={event.icon_url || item.primaryMarkets[0]?.icon_url || '/images/pwa/default-icon-192.png'}
              alt={displayTitle}
              sizes="48px"
              containerClassName="size-full rounded-lg"
            />
          </AppLink>
        )}
        <div className="grid min-w-0 gap-1">
          <FeaturedBreadcrumb items={breadcrumbItems} />
          <AppLink
            intentPrefetch
            href={eventHref}
            className="
              line-clamp-2 text-base font-semibold tracking-tight underline-offset-4
              group-hover/header:underline
              md:text-xl
            "
          >
            {displayTitle}
          </AppLink>
        </div>
      </div>

      {showActions && <FeaturedHeaderActions event={event} />}
    </div>
  )
}

function OutcomeRows({ outcomes, linkedHref }: { outcomes: HomeFeaturedOutcomeSummary[], linkedHref: string }) {
  if (outcomes.length === 0) {
    return null
  }

  return (
    <div className="grid gap-0">
      {outcomes.map(outcome => (
        <AppLink
          key={outcome.key}
          intentPrefetch
          href={linkedHref}
          className={`
            group/outcome grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/50 py-2
            last:border-b-0
          `}
        >
          <span className="flex min-w-0 items-center gap-3">
            {outcome.imageUrl && (
              <span className="size-9 shrink-0 overflow-hidden rounded-md bg-muted">
                <EventIconImage
                  src={outcome.imageUrl}
                  alt={outcome.label}
                  sizes="36px"
                  containerClassName="size-full rounded-md"
                />
              </span>
            )}
            <span className="truncate text-base font-medium underline-offset-2 group-hover/outcome:underline">
              {outcome.label}
            </span>
          </span>
          <span className="text-xl font-semibold tabular-nums">
            {formatChancePercent(outcome.chance)}
          </span>
        </AppLink>
      ))}
    </div>
  )
}

function StandardActions({ item, linkedHref }: { item: HomeFeaturedEventCard, linkedHref: string }) {
  const primaryMarket = item.primaryMarkets[0]
  const outcomes = item.topOutcomes

  if (!primaryMarket || outcomes.length === 0) {
    return null
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {outcomes.slice(0, 2).map((outcome, index) => {
        const isNegative = isNegativeOutcomeLabel(outcome.label) || index === 1

        return (
          <Button
            key={outcome.key}
            type="button"
            asChild
            variant={isNegative ? 'no' : 'yes'}
            className={cn(
              `
                inline-flex h-11 min-w-0 items-center justify-center rounded-lg px-3 text-center text-sm font-semibold
                transition duration-150
                active:scale-[98%]
                md:h-14 md:px-4 md:text-base
              `,
            )}
          >
            <AppLink intentPrefetch href={linkedHref}>
              <span className="truncate">{outcome.label}</span>
            </AppLink>
          </Button>
        )
      })}
    </div>
  )
}

function SportsMarketButton({
  groupLabel,
  market,
  linkedHref,
  className,
  forceNeutral = false,
}: {
  groupLabel: string
  market: FeaturedSportsButtonMarket
  linkedHref: string
  className?: string
  forceNeutral?: boolean
}) {
  const appearance = forceNeutral ? resolveNeutralSportsButtonAppearance() : resolveSportsButtonAppearance(market)

  return (
    <AppLink
      key={`${groupLabel}:${market.key}`}
      intentPrefetch
      href={linkedHref}
      className={cn(
        `
          relative inline-flex min-w-0 items-center justify-center overflow-hidden rounded-lg px-3 text-center
          font-semibold transition duration-150
          active:scale-[98%]
        `,
        appearance.className,
        className,
      )}
      style={appearance.style}
    >
      <span className="relative z-1 truncate">{market.label}</span>
      {(appearance.backgroundClassName || appearance.backgroundStyle)
        ? (
            <span
              className={cn(
                `
                  absolute inset-0 z-0 rounded-lg opacity-20 transition-opacity
                  group-hover/team-button:opacity-40
                  dark:opacity-30
                  dark:group-hover/team-button:opacity-50
                `,
                appearance.backgroundClassName,
              )}
              style={appearance.backgroundStyle}
            />
          )
        : null}
    </AppLink>
  )
}

function SportsMoneylineButtons({
  card,
  linkedHref,
}: {
  card: SportsGamesCard
  linkedHref: string
}) {
  const moneylineButtons = card.buttons
    .filter(button => button.marketType === 'moneyline')
    .sort(compareSportsButtonsByTone)

  if (moneylineButtons.length === 0) {
    return null
  }

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${Math.min(moneylineButtons.length, 3)}, minmax(0, 1fr))` }}
    >
      {moneylineButtons.slice(0, 3).map(button => (
        <SportsMarketButton
          key={button.key}
          groupLabel="Moneyline"
          market={toFeaturedSportsButtonMarket(
            button,
            resolveMoneylineButtonLabel(card, button),
          )}
          linkedHref={linkedHref}
          className="h-14 text-sm md:text-base"
        />
      ))}
    </div>
  )
}

const SPORTS_BUTTON_TONE_ORDER: Record<SportsGamesButton['tone'], number> = {
  team1: 0,
  draw: 1,
  team2: 2,
  over: 3,
  under: 4,
  neutral: 5,
}

function compareSportsButtonsByTone(left: SportsGamesButton, right: SportsGamesButton) {
  const toneComparison = SPORTS_BUTTON_TONE_ORDER[left.tone] - SPORTS_BUTTON_TONE_ORDER[right.tone]
  if (toneComparison !== 0) {
    return toneComparison
  }

  return left.key.localeCompare(right.key)
}

function resolveMoneylineButtonLabel(card: SportsGamesCard, button: SportsGamesButton) {
  if (button.tone === 'team1') {
    return card.teams[0]?.name ?? button.label
  }
  if (button.tone === 'team2') {
    return card.teams[1]?.name ?? button.label
  }
  if (button.tone === 'draw') {
    return 'Draw'
  }

  return button.label
}

function resolveFeaturedSportsButtonTone(button: SportsGamesButton): FeaturedSportsButtonTone {
  if (button.tone === 'team1') {
    return 'home'
  }
  if (button.tone === 'team2') {
    return 'away'
  }
  if (button.tone === 'draw') {
    return 'draw'
  }

  return 'neutral'
}

function toFeaturedSportsButtonMarket(button: SportsGamesButton, label = button.label): FeaturedSportsButtonMarket {
  return {
    key: button.key,
    conditionId: button.conditionId,
    label,
    tone: resolveFeaturedSportsButtonTone(button),
    color: button.color,
  }
}

function extractSignedLineValue(value: string | null | undefined) {
  const match = value?.replace(/[\u2212\u2013\u2014]/g, '-').match(/([+-]\s*\d+(?:\.\d+)?)/)
  const rawValue = match?.[1]?.replace(/\s+/g, '')
  if (!rawValue) {
    return null
  }

  const numericValue = Number(rawValue)
  return Number.isFinite(numericValue) ? numericValue : null
}

function formatSignedSportsLine(value: number) {
  const rounded = Math.round(value * 10) / 10
  const display = Number.isInteger(rounded) ? `${rounded.toFixed(1)}` : `${rounded}`
  return value > 0 ? `+${display}` : display
}

function doesLineMarketTextMatchTeam(market: Market | null | undefined, team: SportsGamesCard['teams'][number] | null | undefined) {
  if (!market || !team) {
    return false
  }

  const marketText = normalizeText([
    market.sports_group_item_title,
    market.short_title,
    market.title,
    market.slug,
  ].filter(Boolean).join(' '))
  const teamName = normalizeText(team.name)
  const teamAbbreviation = normalizeText(team.abbreviation)

  return Boolean(
    (teamName && marketText.includes(teamName))
    || (teamAbbreviation && new Set(marketText.split(' ')).has(teamAbbreviation)),
  )
}

function resolveMarketSignedLine(market: Market | null | undefined) {
  return extractSignedLineValue([
    market?.sports_group_item_title,
    market?.short_title,
    market?.title,
  ].filter(Boolean).join(' '))
}

function resolveSpreadLineForButton(
  card: SportsGamesCard,
  option: SportsLinePickerOption,
  button: SportsGamesButton,
  market: Market | null | undefined,
) {
  const marketLine = resolveMarketSignedLine(market)
  const team1 = card.teams[0]
  const team2 = card.teams[1]
  const marketMatchesTeam1 = doesLineMarketTextMatchTeam(market, team1)
  const marketMatchesTeam2 = doesLineMarketTextMatchTeam(market, team2)
  const marketMatchesSingleTeam = marketMatchesTeam1 !== marketMatchesTeam2

  if (marketLine !== null && marketMatchesSingleTeam) {
    if (button.tone === 'team1') {
      return marketMatchesTeam1 ? marketLine : -marketLine
    }
    if (button.tone === 'team2') {
      return marketMatchesTeam2 ? marketLine : -marketLine
    }
  }

  const buttonLine = extractSignedLineValue(button.label)
  if (buttonLine !== null) {
    return buttonLine
  }

  if (button.tone === 'team1') {
    return -option.lineValue
  }
  if (button.tone === 'team2') {
    return option.lineValue
  }

  return option.lineValue
}

function resolveLineButtonLabel(
  card: SportsGamesCard,
  option: SportsLinePickerOption,
  button: SportsGamesButton,
  market: Market | null | undefined,
  marketType: LinePickerMarketType,
) {
  if (marketType === 'total') {
    return button.tone === 'under' ? `U ${option.label}` : `O ${option.label}`
  }

  const teamName = button.tone === 'team1'
    ? card.teams[0]?.name
    : button.tone === 'team2'
      ? card.teams[1]?.name
      : null
  const line = resolveSpreadLineForButton(card, option, button, market)

  return teamName ? `${teamName} ${formatSignedSportsLine(line)}` : button.label
}

function isFeaturedLineMarket(market: Market | null | undefined, marketType: LinePickerMarketType) {
  if (!market) {
    return false
  }

  const normalizedType = normalizeText(market.sports_market_type)
  const normalizedText = normalizeText([
    market.sports_group_item_title,
    market.short_title,
    market.title,
  ].filter(Boolean).join(' '))

  if (marketType === 'spread') {
    return normalizedType.includes('spread') || normalizedType.includes('handicap')
  }

  const isTeamOrSegmentTotal = normalizedType.includes('team')
    || normalizedText.includes('team total')
    || normalizedText.includes('half')
    || normalizedText.includes('quarter')
    || normalizedText.includes('period')

  return !isTeamOrSegmentTotal
    && (normalizedType === 'totals' || normalizedType.includes(' total') || normalizedType.includes('over under'))
}

function scoreSpreadLineOption(card: SportsGamesCard, option: SportsLinePickerOption, market: Market | null | undefined) {
  const team1 = card.teams[0]
  const marketLine = resolveMarketSignedLine(market)
  if (marketLine !== null && doesLineMarketTextMatchTeam(market, team1) && marketLine < 0) {
    return 3
  }

  const team1ButtonLine = option.buttons
    .filter(button => button.tone === 'team1')
    .map(button => extractSignedLineValue(button.label))
    .find((line): line is number => line !== null)
  if (team1ButtonLine != null && team1ButtonLine < 0) {
    return 2
  }

  return 1
}

function resolveFeaturedLinePickerOptions(card: SportsGamesCard, marketType: LinePickerMarketType) {
  const marketByConditionId = new Map(card.detailMarkets.map(market => [market.condition_id, market] as const))
  const filteredOptions = buildLinePickerOptions(card, marketType)
    .filter(option => isFeaturedLineMarket(marketByConditionId.get(option.conditionId), marketType))

  const byLineValue = new Map<number, SportsLinePickerOption>()
  for (const option of filteredOptions) {
    const existing = byLineValue.get(option.lineValue)
    if (!existing) {
      byLineValue.set(option.lineValue, option)
      continue
    }

    const optionScore = scoreSpreadLineOption(card, option, marketByConditionId.get(option.conditionId))
    const existingScore = scoreSpreadLineOption(card, existing, marketByConditionId.get(existing.conditionId))
    if (
      marketType === 'spread'
      && optionScore > existingScore
    ) {
      byLineValue.set(option.lineValue, option)
    }
  }

  return Array.from(byLineValue.values()).sort((left, right) => left.lineValue - right.lineValue)
}

function LinePickerArrowButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'previous' | 'next'
  disabled: boolean
  onClick: () => void
}) {
  const Icon = direction === 'previous' ? ChevronLeftIcon : ChevronRightIcon

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        `
          inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors
          focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none
        `,
        disabled
          ? 'cursor-not-allowed opacity-35'
          : 'cursor-pointer hover:bg-muted/70 hover:text-foreground',
      )}
      aria-label={direction === 'previous' ? 'Previous line' : 'Next line'}
    >
      <Icon className="size-4.5" />
    </button>
  )
}

function SportsFeaturedLineMarketCarousel({
  card,
  marketType,
  label,
  linkedHref,
}: {
  card: SportsGamesCard
  marketType: LinePickerMarketType
  label: string
  linkedHref: string
}) {
  const options = useMemo(
    () => resolveFeaturedLinePickerOptions(card, marketType),
    [card, marketType],
  )
  const [selectedIndex, setSelectedIndex] = useState(0)
  const activeIndex = options.length === 0 ? 0 : Math.min(selectedIndex, options.length - 1)
  const activeOption = options[activeIndex]
  const marketByConditionId = useMemo(
    () => new Map(card.detailMarkets.map(market => [market.condition_id, market] as const)),
    [card.detailMarkets],
  )

  if (!activeOption) {
    return null
  }

  const canPickPrevious = activeIndex > 0
  const canPickNext = activeIndex < options.length - 1
  const visibleOptions = [
    activeIndex > 0 ? options[activeIndex - 1] : null,
    activeOption,
    activeIndex < options.length - 1 ? options[activeIndex + 1] : null,
  ]
  const activeMarket = marketByConditionId.get(activeOption.conditionId) ?? null
  const visibleButtons = [...activeOption.buttons]
    .sort(compareSportsButtonsByTone)
    .slice(0, 2)

  return (
    <div className="grid gap-2.5">
      <div className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <span className="min-w-0 truncate text-base font-semibold">{label}</span>
        <div className="
          grid grid-cols-[1.75rem_2.5rem_2.5rem_2.5rem_1.75rem] items-center gap-1 text-sm font-semibold tabular-nums
        "
        >
          <LinePickerArrowButton
            direction="previous"
            disabled={!canPickPrevious}
            onClick={() => setSelectedIndex(Math.max(0, activeIndex - 1))}
          />
          {visibleOptions.map((option, index) => (
            <span
              key={option ? `${marketType}:${option.conditionId}` : `${marketType}:empty:${index}`}
              aria-hidden={!option}
              className={cn(
                'inline-flex h-7 min-w-0 items-center justify-center text-center',
                index === 1 ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {option?.label ?? ''}
            </span>
          ))}
          <LinePickerArrowButton
            direction="next"
            disabled={!canPickNext}
            onClick={() => setSelectedIndex(Math.min(options.length - 1, activeIndex + 1))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {visibleButtons.map(button => (
          <SportsMarketButton
            key={button.key}
            groupLabel={label}
            market={toFeaturedSportsButtonMarket(
              button,
              resolveLineButtonLabel(card, activeOption, button, activeMarket, marketType),
            )}
            linkedHref={linkedHref}
            className="h-10 text-sm"
            forceNeutral
          />
        ))}
      </div>
    </div>
  )
}

function SportsFeaturedControls({ card, linkedHref }: { card: SportsGamesCard, linkedHref: string }) {
  const hasMoneyline = card.buttons.some(button => button.marketType === 'moneyline')
  const hasSpread = resolveFeaturedLinePickerOptions(card, 'spread').length > 0
  const hasTotal = resolveFeaturedLinePickerOptions(card, 'total').length > 0
  const hasSecondaryMarkets = hasSpread || hasTotal

  if (!hasMoneyline && !hasSecondaryMarkets) {
    return null
  }

  return (
    <div className="grid gap-4">
      {hasMoneyline && <SportsMoneylineButtons card={card} linkedHref={linkedHref} />}
      {hasMoneyline && hasSecondaryMarkets && <div className="border-t border-border/60" />}
      {hasSpread && (
        <SportsFeaturedLineMarketCarousel
          card={card}
          marketType="spread"
          label="Spread"
          linkedHref={linkedHref}
        />
      )}
      {hasTotal && (
        <SportsFeaturedLineMarketCarousel
          card={card}
          marketType="total"
          label="Total"
          linkedHref={linkedHref}
        />
      )}
    </div>
  )
}

function ContextAvatar({ contextItem }: { contextItem: HomeFeaturedContextItem }) {
  if (contextItem.type === 'news' && contextItem.faviconUrl) {
    return (
      <EventIconImage
        src={contextItem.faviconUrl}
        alt={contextItem.source}
        sizes="28px"
        containerClassName="size-7 shrink-0 rounded-full bg-muted"
        imageClassName="rounded-full"
      />
    )
  }

  if (contextItem.type === 'comment' && contextItem.avatarUrl) {
    return (
      <EventIconImage
        src={contextItem.avatarUrl}
        alt={contextItem.source}
        sizes="28px"
        containerClassName="size-7 shrink-0 rounded-full bg-muted"
        imageClassName="rounded-full"
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className="
        flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold
        text-muted-foreground
      "
    >
      {contextItem.source.trim().charAt(0).toUpperCase() || 'U'}
    </span>
  )
}

function formatContextRelativeTime(value: string | null) {
  if (!value) {
    return null
  }

  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) {
    return null
  }

  const diffSeconds = Math.round((timestamp - Date.now()) / 1000)
  const divisions = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.34524, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' },
  ] as const
  let duration = diffSeconds

  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
        Math.round(duration),
        division.unit,
      )
    }

    duration /= division.amount
  }

  return null
}

function ContextTickerItem({
  contextItem,
  index,
  linkedHref,
}: {
  contextItem: HomeFeaturedContextItem
  index: number
  linkedHref: string
}) {
  const timeLabel = formatContextRelativeTime(contextItem.publishedAt ?? contextItem.selectedAt)
  const isNews = contextItem.type === 'news'

  return (
    <AppLink
      key={`${contextItem.id}:${index}`}
      intentPrefetch
      href={linkedHref}
      className="flex h-10 min-w-0 items-center gap-2 md:h-14"
    >
      {(!isNews || !contextItem.faviconUrl) && <ContextAvatar contextItem={contextItem} />}
      <span className="grid min-w-0 gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {isNews && contextItem.faviconUrl && (
            <EventIconImage
              src={contextItem.faviconUrl}
              alt={contextItem.source}
              sizes="14px"
              containerClassName="size-3.5 shrink-0 rounded-[3px] bg-muted"
              imageClassName="rounded-[3px]"
            />
          )}
          <span className="truncate">{contextItem.source}</span>
          {timeLabel && (
            <>
              <span className="shrink-0 text-muted-foreground/70">·</span>
              <span className="shrink-0">{timeLabel}</span>
            </>
          )}
        </span>
        <span className="line-clamp-1 text-xs/snug text-foreground md:line-clamp-2">
          {contextItem.title}
        </span>
      </span>
    </AppLink>
  )
}

function ContextTicker({ item, linkedHref }: { item: HomeFeaturedEventCard, linkedHref: string }) {
  if (item.contextItems.length === 0) {
    return null
  }

  const tickerItems = item.contextItems.length === 1
    ? item.contextItems
    : [...item.contextItems, ...item.contextItems]
  const tickerDistance = item.contextItems.length * 64
  const tickerStyle = item.contextItems.length > 1
    ? ({
        '--home-featured-context-distance': `${tickerDistance}px`,
        'animationDuration': `${Math.max(14, item.contextItems.length * 3.8)}s`,
      } as CSSProperties)
    : undefined

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden border-t border-border/50 pt-2 md:pt-3">
      <div
        className={cn(
          item.contextItems.length > 1
          && 'grid animate-[home-featured-context-ticker_16s_linear_infinite] gap-2 motion-reduce:animate-none',
        )}
        style={tickerStyle}
      >
        {tickerItems.map((contextItem, index) => (
          <ContextTickerItem
            key={`${contextItem.id}:${index}`}
            contextItem={contextItem}
            index={index}
            linkedHref={linkedHref}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-linear-to-b from-card to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-b from-transparent to-card" />
    </div>
  )
}

function SportsScoreboard({ item }: { item: HomeFeaturedEventCard }) {
  const teams = item.event.sports_teams ?? []
  const logos = item.event.sports_team_logo_urls ?? []
  const score = item.event.sports_score?.trim()
  if (item.kind !== 'sports' || teams.length < 2) {
    return null
  }

  const [homeTeam, awayTeam] = teams
  const [homeLogo, awayLogo] = logos

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-lg bg-secondary/60 p-3">
      <div className="min-w-0 text-center">
        {homeLogo && (
          <EventIconImage
            src={homeLogo}
            alt={homeTeam?.name ?? ''}
            sizes="36px"
            containerClassName="mx-auto mb-1 size-9 rounded-md"
          />
        )}
        <p className="truncate text-sm font-medium">{homeTeam?.name}</p>
      </div>
      <div className="text-center">
        <p className="text-3xl font-semibold tabular-nums">{score || '0 - 0'}</p>
        {(item.event.sports_period || item.event.sports_elapsed) && (
          <p className="text-sm font-medium text-red-500">
            {[item.event.sports_period, item.event.sports_elapsed].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <div className="min-w-0 text-center">
        {awayLogo && (
          <EventIconImage
            src={awayLogo}
            alt={awayTeam?.name ?? ''}
            sizes="36px"
            containerClassName="mx-auto mb-1 size-9 rounded-md"
          />
        )}
        <p className="truncate text-sm font-medium">{awayTeam?.name}</p>
      </div>
    </div>
  )
}

function FeaturedFooter({ item }: { item: HomeFeaturedEventCard }) {
  const site = useSiteIdentity()

  return (
    <div
      className={`
        absolute inset-x-3 bottom-1.5 z-20 flex h-8 shrink-0 items-center justify-between gap-2 bg-card text-[11px]
        leading-none font-normal text-muted-foreground
        md:inset-x-5 md:bottom-4 md:text-sm
      `}
    >
      <span className="shrink-0">{formatVolumeLabel(item.event.volume)}</span>
      <span className="flex min-w-0 items-center justify-end gap-2">
        <span className={cn(
          'inline-flex items-center gap-1.5 whitespace-nowrap',
          item.temporalStatus === 'live' && 'text-red-500',
        )}
        >
          {item.temporalStatus === 'live' && (
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-2 animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-red-500" />
            </span>
          )}
          {item.temporalLabel}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="flex min-w-0 items-center gap-1.5 leading-none">
          <SiteLogoIcon
            logoSvg={site.logoSvg}
            logoImageUrl={site.logoImageUrl}
            alt={`${site.name} logo`}
            className={cn(`
              pointer-events-none size-4 shrink-0 text-current select-none
              [&_svg]:size-4
              [&_svg_*]:fill-current [&_svg_*]:stroke-current
            `)}
            imageClassName="pointer-events-none size-4 object-contain select-none"
            size={16}
          />
          <span className="truncate select-none">{site.name}</span>
        </span>
      </span>
    </div>
  )
}

function FeaturedRightRail({
  hotTopics,
  sideCard,
}: {
  hotTopics: HomeFeaturedHotTopic[]
  sideCard: HomeFeaturedSideCardSettings
}) {
  const activeSlides = sideCard.slides.filter(slide => slide.enabled)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [failedSlideIds, setFailedSlideIds] = useState<Set<string>>(() => new Set())
  const safeIndex = activeSlides.length > 0 ? activeIndex % activeSlides.length : 0
  const activeSlide = activeSlides[safeIndex]

  useEffect(() => {
    if (activeSlides.length <= 1 || isPaused) {
      return
    }
    const interval = window.setInterval(() => {
      setProgress((current) => {
        const next = current + (100 / 70)
        if (next >= 100) {
          setActiveIndex(index => (index + 1) % activeSlides.length)
          return 0
        }
        return next
      })
    }, 100)
    return () => window.clearInterval(interval)
  }, [activeSlides.length, isPaused, safeIndex])

  function renderSlide(slide: HomeFeaturedSideCardSettings['slides'][number]) {
    const href = slide.ctaHref.trim()
    function markMediaFailed() {
      setFailedSlideIds(current => new Set(current).add(slide.id))
    }
    const textContent = (
      <>
        <DynamicIcon
          name={slide.icon as IconName}
          aria-hidden
          className="pointer-events-none absolute -top-6 -right-7 size-36 rotate-6 text-primary/8"
        />
        <div className="relative z-1 flex min-h-0 flex-1 flex-col p-5 pt-7">
          <span className="mb-3 h-1 w-10 rounded-full bg-primary/70" />
          <span className="line-clamp-2 text-xl/tight font-semibold">{slide.title}</span>
          <span className="mt-3 line-clamp-4 text-sm/relaxed text-muted-foreground">{slide.text}</span>
          {slide.ctaLabel && href && (
            <span className="
              mt-auto ml-auto inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-3 py-2 text-sm
              font-medium
            "
            >
              <span className="truncate">{slide.ctaLabel}</span>
              <ChevronRightIcon className="size-4" />
            </span>
          )}
        </div>
      </>
    )
    const hasFailed = failedSlideIds.has(slide.id)
      || (slide.type === 'image' && !slide.imageUrl.trim())
      || (slide.type === 'video' && !slide.videoEmbedUrl.trim())
    const content = slide.type === 'video' && !hasFailed
      ? (/\.(?:mp4|webm)(?:\?.*)?$/i.test(slide.videoEmbedUrl)
          ? (
              <video
                src={slide.videoEmbedUrl}
                title={slide.title || 'Featured video'}
                controls
                muted
                playsInline
                preload="metadata"
                onError={markMediaFailed}
                className="size-full bg-black object-cover"
              />
            )
          : (
              <iframe
                src={slide.videoEmbedUrl}
                title={slide.title || 'Featured video'}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="size-full border-0 bg-black"
              />
            ))
      : slide.type === 'image' && !hasFailed
        ? (
            <>
              <Image
                src={slide.imageUrl}
                alt=""
                fill
                unoptimized
                sizes="(min-width: 1024px) 32vw, 280px"
                onError={markMediaFailed}
                className="object-cover transition-transform duration-300 group-hover/side-card:scale-[1.02]"
              />
              <span className="
                absolute inset-0 z-1 flex flex-col justify-end bg-linear-to-t from-black/80 via-black/10 to-transparent
                p-5 pb-9 text-white
              "
              >
                {slide.title && <span className="line-clamp-2 text-xl/tight font-semibold">{slide.title}</span>}
                {slide.text && <span className="mt-2 line-clamp-2 text-sm/relaxed text-white/80">{slide.text}</span>}
                {slide.ctaLabel && <span className="mt-3 text-sm font-semibold">{slide.ctaLabel}</span>}
              </span>
            </>
          )
        : textContent
    const className = `
      group/side-card relative flex size-full min-w-0 flex-col overflow-hidden bg-card text-card-foreground
      focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none
    `
    if (slide.type === 'video' || !href) {
      return <div className={className}>{content}</div>
    }
    return isExternalHref(href)
      ? <a href={href} target="_blank" rel="noreferrer" className={className}>{content}</a>
      : <AppLink intentPrefetch href={href} className={className}>{content}</AppLink>
  }

  return (
    <aside className="
      hidden h-[clamp(430px,38vw,480px)] min-w-0 grid-rows-[minmax(270px,0.64fr)_minmax(0,0.36fr)] gap-4
      lg:grid
    "
    >
      {activeSlide
        ? (
            <div
              className="
                relative min-h-0 overflow-hidden rounded-xl border border-border/70 bg-card shadow-md shadow-black/4
              "
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              onFocusCapture={() => setIsPaused(true)}
              onBlurCapture={() => setIsPaused(false)}
            >
              {renderSlide(activeSlide)}
              {activeSlides.length > 1 && (
                <div className="absolute inset-x-0 bottom-2 z-3 flex justify-center gap-1.5" role="tablist" aria-label="Side card slides">
                  {activeSlides.map((slide, index) => (
                    <button
                      key={slide.id}
                      type="button"
                      role="tab"
                      aria-selected={index === safeIndex}
                      aria-label={`Show slide ${index + 1}`}
                      onClick={() => {
                        setActiveIndex(index)
                        setProgress(0)
                      }}
                      className={cn('relative h-1.5 overflow-hidden rounded-full bg-white/45 ring-1 ring-black/10', index === safeIndex
                        ? `w-8`
                        : `w-1.5`)}
                    >
                      {index === safeIndex && <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${progress}%` }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        : <div className="min-h-0 rounded-xl border border-border/70 bg-card" />}

      <div className="min-h-0 overflow-hidden p-1">
        <div className="mb-3 flex items-center gap-2">
          <FlameIcon className="size-4 text-no" />
          <span className="text-lg font-semibold">Hot Picks</span>
        </div>
        <div className="grid gap-0.5">
          {hotTopics.slice(0, 3).map((topic, index) => (
            <AppLink
              key={topic.slug}
              intentPrefetch
              href={topic.href}
              className="
                group/topic -mx-2 grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-md px-2
                py-2.5 transition-colors
                hover:bg-secondary/50
              "
            >
              <span className="w-4 text-sm font-medium text-muted-foreground">{index + 1}</span>
              <span className="truncate text-base font-medium underline-offset-2 group-hover/topic:underline">
                {topic.label}
              </span>
              <span className="text-sm text-muted-foreground">
                {`${formatVolume(topic.volume24h)} Vol`}
              </span>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </AppLink>
          ))}
        </div>
      </div>
    </aside>
  )
}

function FeaturedRightRailAction() {
  return (
    <div className="hidden lg:block">
      <Button
        type="button"
        variant="outline"
        asChild
        className="
          h-10 w-full rounded-full bg-transparent text-muted-foreground shadow-none transition-colors
          hover:bg-secondary/80 hover:text-foreground
          dark:bg-transparent
          dark:hover:bg-secondary/80
        "
      >
        <AppLink intentPrefetch href="/predictions/trending">
          Expand all
        </AppLink>
      </Button>
    </div>
  )
}

function FeaturedSlide({
  item,
  isActive,
  isNext,
  isChartEnabled,
}: {
  item: HomeFeaturedEventCard
  isActive: boolean
  isNext: boolean
  isChartEnabled: boolean
}) {
  const isMobile = useIsMobile()
  const linkedHref = resolveEventPagePath(item.event)
  const shouldRenderChart = isChartEnabled && (isActive || isNext)
  const [chartContainerRef, chartContainerWidth] = useElementWidth<HTMLDivElement>(shouldRenderChart)
  const isSingleMarket = item.event.total_markets_count === 1 || item.event.markets.length === 1
  const shouldRenderLiveSeriesChart = Boolean(
    item.liveChartConfig && shouldUseLiveSeriesChart(item.event, item.liveChartConfig),
  )
  const sportsGraphCard = useMemo(
    () => (item.kind === 'sports' ? buildSportsGamesCards([item.event])[0] ?? null : null),
    [item.event, item.kind],
  )
  const sportsGraphSelection = useMemo(
    () => (sportsGraphCard ? resolveSportsGraphSelection(sportsGraphCard) : null),
    [sportsGraphCard],
  )
  const liveChartWidth = typeof chartContainerWidth === 'number' && Number.isFinite(chartContainerWidth)
    ? Math.max(1, chartContainerWidth - HOME_FEATURED_LIVE_CHART_WIDTH_OFFSET)
    : undefined
  const hasContextItems = item.contextItems.length > 0
  const featuredDetailsClassName = cn(
    'flex min-h-0 min-w-0 flex-col gap-2 md:gap-3',
    !hasContextItems && item.kind !== 'sports' && 'justify-center',
  )

  const chartNode = (
    <div
      ref={shouldRenderChart ? chartContainerRef : undefined}
      className={cn(
        item.kind === 'sports'
          ? 'relative min-h-[138px] min-w-0 overflow-hidden md:min-h-[210px] lg:min-h-[230px]'
          : 'relative min-h-[150px] min-w-0 overflow-hidden md:min-h-[260px] lg:min-h-[280px]',
        shouldRenderLiveSeriesChart && 'lg:-mt-1',
      )}
    >
      {shouldRenderChart && (
        <EventMarketChannelProvider markets={item.event.markets}>
          {shouldRenderLiveSeriesChart && item.liveChartConfig
            ? (
                <HomeEventLiveSeriesChart
                  event={item.event}
                  isMobile={isMobile}
                  config={item.liveChartConfig}
                  chartWidth={liveChartWidth}
                  chartHeightOffset={isMobile
                    ? HOME_FEATURED_FULL_CHART_HEIGHT - HOME_FEATURED_MOBILE_CHART_HEIGHT
                    : HOME_FEATURED_CHART_HEIGHT_OFFSET}
                  minimumChartHeight={isMobile ? HOME_FEATURED_MOBILE_CHART_HEIGHT : undefined}
                  showSeriesControls={false}
                />
              )
            : item.kind === 'sports' && sportsGraphCard && sportsGraphSelection
              ? (
                  <HomeSportsGameGraph
                    card={sportsGraphCard}
                    selectedMarketType={sportsGraphSelection.selectedMarketType}
                    selectedConditionId={sportsGraphSelection.selectedConditionId}
                    defaultTimeRange="ALL"
                    chartHeightOffset={isMobile
                      ? HOME_FEATURED_FULL_CHART_HEIGHT - HOME_FEATURED_MOBILE_CHART_HEIGHT
                      : HOME_FEATURED_CHART_HEIGHT_OFFSET}
                    minimumChartHeight={isMobile ? HOME_FEATURED_MOBILE_CHART_HEIGHT : undefined}
                    variant="sportsEventHero"
                    showControls={false}
                  />
                )
              : (
                  <EventChart
                    event={item.event}
                    isMobile={isMobile}
                    showControls={false}
                    showSeriesNavigation={false}
                    showWatermark={false}
                    legendVariant="card"
                    chartWidth={chartContainerWidth}
                    chartHeight={isMobile ? HOME_FEATURED_MOBILE_CHART_HEIGHT : HOME_FEATURED_CHART_HEIGHT}
                    isSingleMarketOverride={isSingleMarket}
                    forceVisible
                  />
                )}
        </EventMarketChannelProvider>
      )}
    </div>
  )
  const chartColumnNode = item.kind === 'sports'
    ? (
        <div className="grid min-h-0 content-start gap-3">
          <SportsScoreboard item={item} />
          {chartNode}
        </div>
      )
    : chartNode

  if (item.kind === 'sports') {
    return (
      <article className="
        relative flex h-full min-w-full flex-col gap-2 overflow-hidden p-3 pb-11
        md:gap-4
        md:p-5 md:pb-[68px]
      "
      >
        <div className="
          grid min-h-0 flex-1 grid-cols-1 gap-2
          md:grid-cols-[minmax(260px,0.8fr)_minmax(320px,1fr)] md:gap-5
          lg:grid-cols-[minmax(320px,0.8fr)_minmax(420px,1fr)] lg:gap-6
        "
        >
          <div className={featuredDetailsClassName}>
            <FeaturedHeader item={item} showActions={false} />
            {sportsGraphCard && <SportsFeaturedControls card={sportsGraphCard} linkedHref={linkedHref} />}
            <ContextTicker item={item} linkedHref={linkedHref} />
          </div>

          {chartColumnNode}
        </div>
        <FeaturedFooter item={item} />
      </article>
    )
  }

  if (shouldRenderLiveSeriesChart) {
    return (
      <article className="
        relative flex h-full min-w-full flex-col gap-2 overflow-hidden p-3 pb-11
        md:gap-4
        md:p-5 md:pb-[68px]
      "
      >
        <div className="
          grid min-h-0 flex-1 grid-cols-1 gap-2
          md:grid-cols-[minmax(240px,0.68fr)_minmax(320px,1fr)] md:gap-5
          lg:grid-cols-[minmax(280px,0.68fr)_minmax(420px,1fr)] lg:gap-6
        "
        >
          <div className={featuredDetailsClassName}>
            <FeaturedHeader item={item} showActions={false} />

            {item.kind === 'standard'
              ? <StandardActions item={item} linkedHref={linkedHref} />
              : <OutcomeRows outcomes={item.topOutcomes} linkedHref={linkedHref} />}

            <ContextTicker item={item} linkedHref={linkedHref} />
          </div>

          {chartColumnNode}
        </div>
        <FeaturedFooter item={item} />
      </article>
    )
  }

  return (
    <article className="
      relative flex h-full min-w-full flex-col gap-2 overflow-hidden p-3 pb-11
      md:gap-4
      md:p-5 md:pb-[68px]
    "
    >
      <FeaturedHeader item={item} />
      <div className="
        grid min-h-0 flex-1 grid-cols-1 gap-2
        md:grid-cols-[minmax(260px,0.8fr)_minmax(320px,1fr)] md:gap-5
        lg:grid-cols-[minmax(320px,0.8fr)_minmax(420px,1fr)] lg:gap-6
      "
      >
        <div className={featuredDetailsClassName}>
          {item.kind === 'standard'
            ? <StandardActions item={item} linkedHref={linkedHref} />
            : <OutcomeRows outcomes={item.topOutcomes} linkedHref={linkedHref} />}

          <ContextTicker item={item} linkedHref={linkedHref} />
        </div>

        {chartColumnNode}
      </div>
      <FeaturedFooter item={item} />
    </article>
  )
}

export default function HomeFeaturedEventsCarousel({ hotTopics, items, sideCard }: HomeFeaturedEventsCarouselProps) {
  const t = useExtracted()
  const user = useUser()
  const showOnMobile = user?.settings?.display?.show_home_featured_mobile !== false
  const sectionRef = useRef<HTMLElement | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isChartNearViewport, setIsChartNearViewport] = useState(false)
  const [isAutoAdvancePaused, setIsAutoAdvancePaused] = useState(false)
  const hasMultipleItems = items.length > 1
  const activeItem = items[activeIndex]
  const nextIndex = items.length === 0 ? 0 : (activeIndex + 1) % items.length

  useEffect(function observeFeaturedCarousel() {
    const node = sectionRef.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) {
        return
      }

      setIsChartNearViewport(true)
      observer.disconnect()
    }, { rootMargin: '480px 0px' })

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  if (!activeItem) {
    return null
  }

  function goToIndex(nextIndex: number) {
    if (items.length === 0) {
      return
    }

    setActiveIndex((nextIndex + items.length) % items.length)
  }

  return (
    <section ref={sectionRef} className={cn(showOnMobile ? 'grid' : 'hidden md:grid', 'gap-3')}>
      <div className="grid gap-x-7 gap-y-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.44fr)]">
        <div
          className="h-[420px] overflow-hidden rounded-xl border bg-card shadow-md shadow-black/4 sm:h-[450px] md:h-[clamp(430px,38vw,480px)]"
          onMouseEnter={() => setIsAutoAdvancePaused(true)}
          onMouseLeave={() => setIsAutoAdvancePaused(false)}
          onFocusCapture={() => setIsAutoAdvancePaused(true)}
          onBlurCapture={() => setIsAutoAdvancePaused(false)}
        >
          <div
            className={`
              flex h-full transition-transform duration-420 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform
              motion-reduce:transition-none
            `}
            style={{ transform: `translateX(-${activeIndex * 100}%)` }}
          >
            {items.map((item, index) => (
              <FeaturedSlide
                key={item.featuredId}
                item={item}
                isActive={index === activeIndex}
                isNext={index === nextIndex}
                isChartEnabled={isChartNearViewport}
              />
            ))}
          </div>
        </div>

        <FeaturedRightRail hotTopics={hotTopics} sideCard={sideCard} />

        {hasMultipleItems
          ? (
              <div className="flex items-center justify-between gap-3 px-3 md:gap-4 md:px-5 lg:px-6">
                <div className="flex min-w-0 items-center gap-2">
                  {items.map((item, index) => (
                    <button
                      key={`dot-${item.featuredId}`}
                      type="button"
                      aria-label={t('Show featured market')}
                      aria-current={index === activeIndex ? 'true' : undefined}
                      onClick={() => goToIndex(index)}
                      className={cn(
                        'relative h-1.5 rounded-full transition-all md:h-2',
                        index === activeIndex
                          ? 'w-9 overflow-hidden bg-muted-foreground/30 md:w-12'
                          : 'w-1.5 bg-muted-foreground/35 hover:bg-muted-foreground/60 md:w-2',
                      )}
                    >
                      {index === activeIndex && (
                        <span
                          key={`progress-${item.featuredId}-${activeIndex}`}
                          className="
                            absolute inset-y-0 left-0 w-full origin-left
                            animate-[home-featured-pagination-progress_7000ms_linear_forwards] rounded-full
                            bg-foreground/80
                            motion-reduce:scale-x-100 motion-reduce:animate-none
                          "
                          style={{ animationPlayState: isAutoAdvancePaused ? 'paused' : 'running' }}
                          onAnimationEnd={() => {
                            if (!isAutoAdvancePaused) {
                              goToIndex(activeIndex + 1)
                            }
                          }}
                        />
                      )}
                    </button>
                  ))}
                </div>

                <div
                  className="flex min-w-0 items-center gap-2"
                  onMouseEnter={() => setIsAutoAdvancePaused(true)}
                  onMouseLeave={() => setIsAutoAdvancePaused(false)}
                  onFocusCapture={() => setIsAutoAdvancePaused(true)}
                  onBlurCapture={() => setIsAutoAdvancePaused(false)}
                >
                  <Button
                    type="button"
                    variant="secondary"
                    className="size-8 rounded-full p-0 text-muted-foreground hover:text-muted-foreground md:h-10 md:w-auto md:px-4"
                    onClick={() => goToIndex(activeIndex - 1)}
                  >
                    <ChevronLeftIcon className="size-4" />
                    <span className="hidden max-w-44 truncate text-xs md:inline">{activeItem.previousTitle}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="size-8 rounded-full p-0 text-muted-foreground hover:text-muted-foreground md:h-10 md:w-auto md:px-4"
                    onClick={() => goToIndex(activeIndex + 1)}
                  >
                    <span className="hidden max-w-44 truncate text-xs md:inline">{activeItem.nextTitle}</span>
                    <ChevronRightIcon className="size-4" />
                  </Button>
                </div>
              </div>
            )
          : <div />}

        <FeaturedRightRailAction />
      </div>
    </section>
  )
}
