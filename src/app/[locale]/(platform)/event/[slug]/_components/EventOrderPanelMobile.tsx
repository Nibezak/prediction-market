import type { ReactNode } from 'react'
import type { EventOrderPanelOutcomeSelectedAccent } from '@/app/[locale]/(platform)/event/[slug]/_components/EventOrderPanelOutcomeButton'
import type { OddsFormat } from '@/lib/odds-format'
import type { Event, Market, Outcome } from '@/types'
import { useExtracted } from 'next-intl'
import { useEffect, useState } from 'react'
import { MOBILE_BOTTOM_NAV_OFFSET } from '@/app/[locale]/(platform)/_lib/mobile-bottom-nav'
import EventOrderPanelForm from '@/app/[locale]/(platform)/event/[slug]/_components/EventOrderPanelForm'
import EventOrderPanelTermsDisclaimer
  from '@/app/[locale]/(platform)/event/[slug]/_components/EventOrderPanelTermsDisclaimer'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { useOutcomeLabel } from '@/hooks/useOutcomeLabel'
import { ORDER_SIDE, OUTCOME_INDEX } from '@/lib/constants'
import { formatCentsLabel } from '@/lib/formatters'
import { resolveFallbackOutcomeUnitPrice, resolveMarketOutcome } from '@/lib/market-pricing'
import { formatOddsFromPrice } from '@/lib/odds-format'
import { useIsSingleMarket, useOrder, useOutcomeTopOfBookPrice } from '@/stores/useOrder'

interface EventMobileOrderPanelProps {
  event: Event
  initialMarket?: Market | null
  initialOutcome?: Outcome | null
  showDefaultTrigger?: boolean
  mobileMarketInfo?: ReactNode
  primaryOutcomeIndex?: number | null
  oddsFormat?: OddsFormat
  outcomeButtonStyleVariant?: 'default' | 'sports3d'
  outcomeLabelOverrides?: Partial<Record<number, string>>
  outcomeAccentOverrides?: Partial<Record<number, EventOrderPanelOutcomeSelectedAccent>>
  optimisticallyClaimedConditionIds?: Record<string, true>
}

export default function EventOrderPanelMobile({
  event,
  initialMarket = null,
  initialOutcome = null,
  showDefaultTrigger = true,
  mobileMarketInfo,
  primaryOutcomeIndex = null,
  oddsFormat = 'price',
  outcomeButtonStyleVariant = 'default',
  outcomeLabelOverrides = {},
  outcomeAccentOverrides = {},
  optimisticallyClaimedConditionIds,
}: EventMobileOrderPanelProps) {
  const t = useExtracted()
  const normalizeOutcomeLabel = useOutcomeLabel()
  const [selectedMobileOutcome, setSelectedMobileOutcome] = useState<Outcome | null>(initialOutcome)
  const state = useOrder()
  const hasMatchingStoreEvent = state.event?.id === event.id
  const hasMatchingStoreMarket = Boolean(
    state.market
    && event.markets.some(market => market.condition_id === state.market?.condition_id),
  )
  const activeEvent: Event = hasMatchingStoreEvent && state.event ? state.event : event
  const activeMarket = hasMatchingStoreMarket ? state.market : initialMarket
  const fallbackOutcome = initialOutcome ?? activeMarket?.outcomes[0] ?? null
  const hasMatchingStoreOutcome = Boolean(
    state.outcome
    && activeMarket
    && activeMarket.outcomes.some(outcome =>
      outcome.token_id === state.outcome?.token_id
      || (outcome.outcome_index === state.outcome?.outcome_index && outcome.outcome_text === state.outcome?.outcome_text)),
  )
  const activeOutcome = selectedMobileOutcome ?? (hasMatchingStoreOutcome ? state.outcome : fallbackOutcome)
  useEffect(() => {
    if (state.outcome && activeMarket && activeMarket.outcomes.some(outcome => outcome.token_id === state.outcome?.token_id)) {
      setSelectedMobileOutcome(state.outcome)
    }
  }, [activeMarket, state.outcome])
  const isSingleMarket = useIsSingleMarket() || activeEvent.total_markets_count === 1
  const liveYesPrice = useOutcomeTopOfBookPrice(OUTCOME_INDEX.YES, ORDER_SIDE.BUY)
  const liveNoPrice = useOutcomeTopOfBookPrice(OUTCOME_INDEX.NO, ORDER_SIDE.BUY)
  const activeLiveYesPrice = hasMatchingStoreMarket ? liveYesPrice : null
  const activeLiveNoPrice = hasMatchingStoreMarket ? liveNoPrice : null
  const yesOutcome = resolveMarketOutcome(activeMarket, OUTCOME_INDEX.YES)
  const noOutcome = resolveMarketOutcome(activeMarket, OUTCOME_INDEX.NO)
  const yesPrice = activeLiveYesPrice ?? resolveFallbackOutcomeUnitPrice(activeMarket, yesOutcome)
  const noPrice = activeLiveNoPrice ?? resolveFallbackOutcomeUnitPrice(activeMarket, noOutcome)
  const buyYesOutcome = yesOutcome ?? activeMarket?.outcomes[0] ?? null
  const buyNoOutcome = noOutcome ?? activeMarket?.outcomes[1] ?? null
  const buyYesOutcomeLabel = outcomeLabelOverrides[OUTCOME_INDEX.YES]?.trim()
    || (buyYesOutcome?.outcome_text
      ? (normalizeOutcomeLabel(buyYesOutcome.outcome_text) ?? buyYesOutcome.outcome_text)
      : t('Yes'))
  const buyNoOutcomeLabel = outcomeLabelOverrides[OUTCOME_INDEX.NO]?.trim()
    || (buyNoOutcome?.outcome_text
      ? (normalizeOutcomeLabel(buyNoOutcome.outcome_text) ?? buyNoOutcome.outcome_text)
      : t('No'))
  const shouldShowDefaultTrigger = showDefaultTrigger && isSingleMarket
  const yesPriceLabel = oddsFormat === 'price'
    ? formatCentsLabel(yesPrice)
    : formatOddsFromPrice(yesPrice, oddsFormat)
  const noPriceLabel = oddsFormat === 'price'
    ? formatCentsLabel(noPrice)
    : formatOddsFromPrice(noPrice, oddsFormat)

  return (
    <Drawer
      open={state.isMobileOrderPanelOpen}
      onClose={() => state.setIsMobileOrderPanelOpen(false)}
      repositionInputs={false}
    >
      {shouldShowDefaultTrigger && (
        <div
          className="fixed inset-x-0 z-30 border-t bg-background p-4 lg:hidden"
          style={{ bottom: MOBILE_BOTTOM_NAV_OFFSET }}
        >
            <div className="flex gap-2">
              <Button
                variant="yes"
                size="outcomeLg"
                onClick={() => {
                  if (!activeMarket || !buyYesOutcome) {
                    return
                  }

                  state.setMarket(activeMarket)
                  state.setOutcome(buyYesOutcome)
                  setSelectedMobileOutcome(buyYesOutcome)
                  state.setIsMobileOrderPanelOpen(true)
                }}
              >
                <span className="truncate font-bold">
                  {t('Buy')}
                  {' '}
                  {buyYesOutcomeLabel}
                </span>
              </Button>
              <Button
                variant="no"
                size="outcomeLg"
                onClick={() => {
                  if (!activeMarket || !buyNoOutcome) {
                    return
                  }

                  state.setMarket(activeMarket)
                  state.setOutcome(buyNoOutcome)
                  setSelectedMobileOutcome(buyNoOutcome)
                  state.setIsMobileOrderPanelOpen(true)
                }}
              >
                <span className="truncate font-bold">
                  {t('Buy')}
                  {' '}
                  {buyNoOutcomeLabel}
                </span>
              </Button>
            </div>
        </div>
      )}

      <DrawerContent className="max-h-[95vh] w-full">
        <DrawerTitle className="sr-only">{event.title}</DrawerTitle>

        <EventOrderPanelForm
          event={event}
          isMobile={true}
          initialMarket={activeMarket}
          initialOutcome={activeOutcome}
          mobileMarketInfo={mobileMarketInfo}
          primaryOutcomeIndex={primaryOutcomeIndex}
          oddsFormat={oddsFormat}
          outcomeButtonStyleVariant={outcomeButtonStyleVariant}
          outcomeLabelOverrides={outcomeLabelOverrides}
          outcomeAccentOverrides={outcomeAccentOverrides}
          optimisticallyClaimedConditionIds={optimisticallyClaimedConditionIds}
        />
        <EventOrderPanelTermsDisclaimer />
      </DrawerContent>
    </Drawer>
  )
}
