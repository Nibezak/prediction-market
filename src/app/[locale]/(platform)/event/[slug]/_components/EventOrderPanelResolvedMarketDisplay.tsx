'use client'

import { CheckIcon, XIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { Button } from '@/components/ui/button'

interface EventOrderPanelResolvedMarketDisplayProps {
  variant?: 'resolved' | 'paused' | 'closed'
  resolvedOutcomeLabel: string | null
  isSingleMarket: boolean
  shouldShowResolvedSportsSubtitle: boolean
  resolvedMarketTitle: string | null
  positionRows: Array<{ label: string, shares: string, stake: string }>
  hasClaimableWinnings: boolean
  claimPositionLabel: string
  claimValuePerShareLabel: string
  claimTotalLabel: string
  isClaimSubmitting: boolean
  isPositionsLoading: boolean
  onClaimWinnings: () => void
}

export default function EventOrderPanelResolvedMarketDisplay({
  variant = 'resolved',
  resolvedOutcomeLabel,
  isSingleMarket,
  shouldShowResolvedSportsSubtitle,
  resolvedMarketTitle,
  positionRows,
  hasClaimableWinnings,
  claimPositionLabel,
  claimValuePerShareLabel,
  claimTotalLabel,
  isClaimSubmitting,
  isPositionsLoading,
  onClaimWinnings,
}: EventOrderPanelResolvedMarketDisplayProps) {
  const t = useExtracted()
  const isPaused = variant === 'paused'
  const isClosed = variant === 'closed'
  const StatusIcon = isPaused || isClosed ? XIcon : CheckIcon

  return (
    <div className="flex flex-col items-center gap-3 px-2 py-4 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-primary">
        <StatusIcon className="size-7 text-background" strokeWidth={3} />
      </div>
      <div className="text-lg font-bold text-primary">
        {isPaused || isClosed
          ? (isClosed ? t('Market Closed') : t('Market Paused'))
          : (
              <>
                {resolvedMarketTitle && !isSingleMarket ? `${resolvedMarketTitle}:` : t('Outcome:')}
                {' '}
                {resolvedOutcomeLabel}
              </>
            )}
      </div>
      {isClosed && (
        <div className="text-sm text-muted-foreground">{t('Awaiting final outcome')}</div>
      )}
      {!isPaused && ((isSingleMarket && shouldShowResolvedSportsSubtitle) && resolvedMarketTitle) && (
        <div className="text-sm text-muted-foreground">{resolvedMarketTitle}</div>
      )}
      {!isPaused && positionRows.length > 0 && (
        <div className="mt-2 w-full border-t border-border pt-3 text-left">
          <p className="mb-2 text-center text-sm font-semibold text-foreground">{t('Your trade')}</p>
          <div className="divide-y divide-border border border-border">
            {positionRows.map(row => (
              <div key={row.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{row.label}</span>
                <span className="text-muted-foreground">{row.shares}</span>
                <span className="font-medium text-foreground">{row.stake}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!isPaused && hasClaimableWinnings && (
        <div className="mt-2 w-full space-y-3 text-left">
          <div className="w-full border-t border-border" />
          <p className="text-center text-base font-semibold text-foreground">{t('Your Earnings')}</p>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t('Position')}</span>
              <span className="text-right font-medium text-foreground">{claimPositionLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t('Value per share')}</span>
              <span className="text-right font-medium text-foreground">{claimValuePerShareLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{t('Total')}</span>
              <span className="text-right font-medium text-foreground">{claimTotalLabel}</span>
            </div>
          </div>
          <Button
            type="button"
            className="h-10 w-full"
            onClick={onClaimWinnings}
            disabled={isClaimSubmitting || isPositionsLoading}
          >
            {isClaimSubmitting ? t('Submitting...') : t('Claim winnings')}
          </Button>
        </div>
      )}
    </div>
  )
}
