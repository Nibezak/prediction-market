import type { EventFaqItem } from '@/lib/event-faq'
import type { Event, EventLiveChartConfig, EventSeriesEntry } from '@/types'
import EventBackToTopButton from '@/app/[locale]/(platform)/event/[slug]/_components/EventBackToTopButton'
import EventCategoryNote from '@/app/[locale]/(platform)/event/[slug]/_components/EventCategoryNote'
import EventChartSection from '@/app/[locale]/(platform)/event/[slug]/_components/EventChartSection'
import EventDesktopSidebar from '@/app/[locale]/(platform)/event/[slug]/_components/EventDesktopSidebar'
import EventHeader from '@/app/[locale]/(platform)/event/[slug]/_components/EventHeader'
import EventMarketChannelProvider from '@/app/[locale]/(platform)/event/[slug]/_components/EventMarketChannelProvider'
import EventMarketContextSlot from '@/app/[locale]/(platform)/event/[slug]/_components/EventMarketContextSlot'
import EventMarketsSection from '@/app/[locale]/(platform)/event/[slug]/_components/EventMarketsSection'
import EventMobileOrderPanelSlot from '@/app/[locale]/(platform)/event/[slug]/_components/EventMobileOrderPanelSlot'
import EventOrderStateSync from '@/app/[locale]/(platform)/event/[slug]/_components/EventOrderStateSync'
import EventRelatedSlot from '@/app/[locale]/(platform)/event/[slug]/_components/EventRelatedSlot'
import EventRules from '@/app/[locale]/(platform)/event/[slug]/_components/EventRules'
import EventTabsSection from '@/app/[locale]/(platform)/event/[slug]/_components/EventTabsSection'
import ResolutionTimelinePanel from '@/app/[locale]/(platform)/event/[slug]/_components/ResolutionTimelinePanel'
import {
  resolveEventResolvedOutcomeIndex,
  toResolutionTimelineOutcome,
} from '@/app/[locale]/(platform)/event/[slug]/_utils/eventResolvedOutcome'
import { shouldDisplayResolutionTimeline } from '@/app/[locale]/(platform)/event/[slug]/_utils/resolution-timeline-builder'
import { cn } from '@/lib/utils'
import { resolveDefaultEventMarket } from '@/lib/event-market-selection'

interface EventContentProps {
  event: Event
  faqItems: EventFaqItem[]
  marketContextEnabled: boolean
  marketSlug?: string
  seriesEvents?: EventSeriesEntry[]
  liveChartConfig?: EventLiveChartConfig | null
}

function isMarketResolved(market: Event['markets'][number] | null | undefined) {
  return Boolean(market?.is_resolved || market?.condition?.resolved)
}

function resolveInitialMarket(event: Event, marketSlug?: string) {
  if (marketSlug) {
    return event.markets.find(market => market.slug === marketSlug) ?? resolveDefaultEventMarket(event.markets) ?? null
  }
  return resolveDefaultEventMarket(event.markets) ?? null
}

function resolveTimelineOutcome(event: Event, market: Event['markets'][number] | null | undefined) {
  if (!market || !isMarketResolved(market)) {
    return null
  }

  return toResolutionTimelineOutcome(resolveEventResolvedOutcomeIndex(event, market))
}

export default function EventContent({
  event,
  faqItems,
  marketContextEnabled,
  marketSlug,
  seriesEvents = [],
  liveChartConfig = null,
}: EventContentProps) {
  const singleMarket = event.markets[0]
  const initialMarket = resolveInitialMarket(event, marketSlug)
  const initialOutcome = initialMarket?.outcomes[0] ?? null
  const shouldHideChart = event.markets.length === 0
  const selectedMarketTimelineOutcome = resolveTimelineOutcome(event, singleMarket)

  return (
    <EventMarketChannelProvider markets={event.markets}>
      <EventOrderStateSync event={event} marketSlug={marketSlug} />
      <div className="grid gap-6 pt-5 pb-20 md:pb-0">
        <div
          id="event-content-main"
          className={cn(shouldHideChart ? 'grid gap-2' : 'grid gap-3')}
        >
          <EventCategoryNote event={event} />
          <EventHeader event={event} />

          <div className={cn(shouldHideChart ? 'w-full' : 'min-h-96 w-full')}>
            <EventChartSection
              event={event}
              seriesEvents={seriesEvents}
              liveChartConfig={liveChartConfig}
            />
          </div>

          <div className="grid gap-6">
            <EventMarketsSection event={event} liveChartConfig={liveChartConfig} />
            <EventMarketContextSlot enabled={marketContextEnabled} event={event} />
            <EventRules event={event} />
            {event.total_markets_count === 1
              && singleMarket
              && shouldDisplayResolutionTimeline(singleMarket) && (
              <div className="rounded-xl border bg-background p-4">
                <ResolutionTimelinePanel
                  market={singleMarket}
                  settledUrl={null}
                  outcomeOverride={selectedMarketTimelineOutcome}
                  showLink={false}
                />
              </div>
            )}
          </div>

          <EventRelatedSlot event={event} placement="mobile" />
          <EventTabsSection event={event} faqItems={faqItems} />
        </div>
      </div>

      <EventDesktopSidebar
        event={event}
        initialMarket={initialMarket}
        initialOutcome={initialOutcome}
      />
      <EventBackToTopButton />
      <EventMobileOrderPanelSlot
        event={event}
        initialMarket={initialMarket}
        initialOutcome={initialOutcome}
      />
    </EventMarketChannelProvider>
  )
}
