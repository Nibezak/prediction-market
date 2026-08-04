'use client'

import type { EventMarketRow } from '@/app/[locale]/(platform)/event/[slug]/_hooks/useEventMarketRows'
import { CheckIcon, XIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'
import { resolveWinningOutcomeIndex } from '@/app/[locale]/(platform)/event/[slug]/_utils/eventMarketUtils'
import EventIconImage from '@/components/EventIconImage'
import { useOutcomeLabel } from '@/hooks/useOutcomeLabel'
import { OUTCOME_INDEX } from '@/lib/constants'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/utils'

export default function ResolvedMarketRow({
  row,
  showMarketIcon,
  isExpanded,
  resolvedOutcomeIndexOverride = null,
  onToggle,
}: {
  row: EventMarketRow
  showMarketIcon: boolean
  isExpanded: boolean
  resolvedOutcomeIndexOverride?: typeof OUTCOME_INDEX.YES | typeof OUTCOME_INDEX.NO | null
  onToggle: () => void
}) {
  const t = useExtracted()
  const locale = useLocale()
  const normalizeOutcomeLabel = useOutcomeLabel()
  const { market } = row
  const resolvedOutcomeIndex = resolvedOutcomeIndexOverride ?? resolveWinningOutcomeIndex(market)
  const hasResolvedOutcome = resolvedOutcomeIndex === OUTCOME_INDEX.YES || resolvedOutcomeIndex === OUTCOME_INDEX.NO
  const isYesOutcome = resolvedOutcomeIndex === OUTCOME_INDEX.YES
  const resolvedOutcomeText = market.outcomes.find(
    outcome => outcome.outcome_index === resolvedOutcomeIndex,
  )?.outcome_text
  const resolvedOutcomeLabel = (resolvedOutcomeText ? normalizeOutcomeLabel(resolvedOutcomeText) : '')
    || resolvedOutcomeText
    || (isYesOutcome ? t('Yes') : t('No'))
  const resolvedVolume = Number.isFinite(market.volume) ? market.volume : 0
  const shouldShowIcon = showMarketIcon && Boolean(market.icon_url)

  return (
    <div
      className={cn(
        `
          group relative z-0 flex w-full cursor-pointer flex-col items-start py-3 pr-2 pl-4 transition-all duration-200
          ease-in-out
          before:pointer-events-none before:absolute before:-inset-x-3 before:inset-y-0 before:-z-10 before:rounded-lg
          before:bg-black/5 before:opacity-0 before:transition-opacity before:duration-200 before:content-['']
          hover:before:opacity-100
          lg:flex-row lg:items-center lg:rounded-lg lg:px-0
          dark:before:bg-white/5
        `,
      )}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
    >
      <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex w-full items-start gap-3 lg:w-2/5">
          {shouldShowIcon && (
            <EventIconImage
              src={market.icon_url}
              alt={market.title}
              sizes="42px"
              containerClassName="size-[42px] shrink-0 rounded-md"
            />
          )}
          <div>
            <div className="text-sm font-bold underline-offset-2 group-hover:underline">
              {market.short_title || market.title}
            </div>

          </div>
        </div>

        <div className="flex w-full justify-end lg:ms-auto lg:w-auto">
          {hasResolvedOutcome
            ? (
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="text-base font-bold">{resolvedOutcomeLabel}</span>
                  <span className={cn(
                    'flex size-4 items-center justify-center rounded-full',
                    isYesOutcome ? 'bg-yes' : 'bg-no',
                  )}
                  >
                    {isYesOutcome
                      ? <CheckIcon className="size-3 text-background" strokeWidth={2.5} />
                      : <XIcon className="size-3 text-background" strokeWidth={2.5} />}
                  </span>
                </span>
              )
            : (
                <span className="text-sm font-semibold text-muted-foreground">{t('Resolved')}</span>
              )}
        </div>
      </div>
    </div>
  )
}
