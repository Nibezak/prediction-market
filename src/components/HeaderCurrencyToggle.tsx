'use client'

import { CircleDollarSignIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import { cn } from '@/lib/utils'

export default function HeaderCurrencyToggle({ showBoth = false }: { showBoth?: boolean }) {
  const { currency, setCurrency, toggleCurrency } = useDisplayCurrency()
  const router = useRouter()
  async function handleToggle() {
    const saved = await toggleCurrency()
    if (saved) {
      router.refresh()
    }
  }
  if (showBoth) {
    return (
      <div className="inline-flex h-6 items-center rounded-md border bg-muted/30 p-0.5" role="group" aria-label="Display currency">
        {(['USD', 'KES'] as const).map(option => (
          <button
            key={option}
            type="button"
            className={cn(
              'h-5 min-w-7 rounded px-1.5 text-[10px] font-semibold transition-colors',
              currency === option
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            aria-pressed={currency === option}
            title={option === 'USD' ? 'Show values in US dollars' : 'Show values in Kenyan shillings'}
            onClick={async () => {
              if (currency === option) {
                return
              }
              if (await setCurrency(option)) {
                router.refresh()
              }
            }}
          >
            {option === 'USD' ? '$' : 'KES'}
          </button>
        ))}
      </div>
    )
  }

  return (
    <Button
      type="button"
      size="headerIconCompact"
      variant="ghost"
      aria-label="Toggle display currency"
      title="Toggle display currency"
      onClick={handleToggle}
      className="min-w-9 px-2 text-xs font-bold"
    >
      {currency === 'USD' ? <CircleDollarSignIcon className="size-5" /> : 'KES'}
    </Button>
  )
}
