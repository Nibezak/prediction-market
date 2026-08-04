import type { Event } from '@/types'
import { Repeat } from 'lucide-react'
import EventBookmark from '@/app/[locale]/(platform)/event/[slug]/_components/EventBookmark'
import { NewBadge } from '@/components/ui/new-badge'
import { formatVolume } from '@/lib/formatters'
import { isEventResolvedLike } from '@/lib/home-events'

interface EventCardFooterProps {
  event: Event
  shouldShowNewBadge: boolean
  showLiveBadge: boolean
  resolvedVolume: number
  endedLabel?: string | null
  shouldShowEndingSoonBadge?: boolean
}

export default function EventCardFooter({
  event,
  shouldShowNewBadge,
  showLiveBadge,
  resolvedVolume,
  endedLabel,
  shouldShowEndingSoonBadge = false,
}: EventCardFooterProps) {
  const isResolvedEvent = isEventResolvedLike(event)
  const recurrenceLabel = event.series_recurrence?.trim() || null
  const recurrenceDisplayLabel = recurrenceLabel
    ? `${recurrenceLabel.charAt(0).toUpperCase()}${recurrenceLabel.slice(1)}`
    : null

  return (
    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        {showLiveBadge && !shouldShowNewBadge && !shouldShowEndingSoonBadge && (
          <span className="flex items-center gap-1.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-2 animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-red-500" />
            </span>
            <span className="leading-none font-medium text-red-500 uppercase">Live</span>
          </span>
        )}
        <span>
          {formatVolume(resolvedVolume)}
          {' '}
          Vol.
        </span>
        {Boolean(event.trades_count && event.trades_count >= 10) && (
          <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
            <span>👥</span>
            <span>{event.trades_count} trades</span>
          </span>
        )}
        {recurrenceDisplayLabel && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Repeat className="size-3" />
            <span>{recurrenceDisplayLabel}</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {shouldShowEndingSoonBadge && (
          <span className="inline-flex items-center bg-transparent px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-500 dark:text-amber-400">
            Ending soon
          </span>
        )}
        {shouldShowNewBadge && !shouldShowEndingSoonBadge && <NewBadge />}
        {isResolvedEvent
          ? (endedLabel
              ? <span>{endedLabel}</span>
              : null)
          : <EventBookmark event={event} refreshStatusOnMount={false} />}
      </div>
    </div>
  )
}
