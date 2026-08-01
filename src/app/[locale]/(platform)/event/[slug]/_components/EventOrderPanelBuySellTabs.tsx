import type { OrderSide, OrderType } from '@/types'
import { useExtracted } from 'next-intl'

interface EventOrderPanelBuySellTabsProps {
  side: OrderSide
  type: OrderType
  availableMergeShares: number
  availableSplitBalance: number
  eventId: string
  eventSlug: string
  isNegRiskMarket?: boolean
  negRiskAdapterAddress?: `0x${string}` | null
  conditionId?: string
  marketSlug?: string | null
  eventPath?: string | null
  marketTitle?: string | null
  marketIconUrl?: string | null
  onSideChange: (side: OrderSide) => void
  onTypeChange: (type: OrderType) => void
  onAmountReset: () => void
  onFocusInput: () => void
}

export default function EventOrderPanelBuySellTabs({
  side,
  type,
  availableMergeShares,
  availableSplitBalance,
  eventId,
  eventSlug,
  isNegRiskMarket = false,
  negRiskAdapterAddress = null,
  conditionId,
  marketSlug,
  eventPath,
  marketTitle,
  marketIconUrl,
  onSideChange,
  onTypeChange,
  onAmountReset,
  onFocusInput,
}: EventOrderPanelBuySellTabsProps) {
  const t = useExtracted()

  return (
    <div className="relative mb-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-sm font-semibold">
          <span className="border-b-3 border-foreground pb-2 text-base font-semibold text-foreground">
            {t('Buy')}
          </span>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-4 bottom-0 h-px bg-border"
      />
    </div>
  )
}
