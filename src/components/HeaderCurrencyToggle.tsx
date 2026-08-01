'use client'

import { CircleDollarSignIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import { cn } from '@/lib/utils'

export default function HeaderCurrencyToggle({ showBoth = false }: { showBoth?: boolean }) {
  const { currency, toggleCurrency } = useDisplayCurrency()
  if (showBoth) {
    return (
      <Button
        type="button"
        size="headerCompact"
        variant="ghost"
        aria-label="Toggle display currency"
        title="Toggle display currency"
        onClick={toggleCurrency}
        className="gap-1 px-2 text-xs font-bold"
      >
        <span className={cn('rounded px-1.5 py-0.5', currency === 'USD' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
          $
        </span>
        <span className={cn('rounded px-1.5 py-0.5', currency === 'KES' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
          KES
        </span>
      </Button>
    )
  }

  return (
    <Button
      type="button"
      size="headerIconCompact"
      variant="ghost"
      aria-label="Toggle display currency"
      title="Toggle display currency"
      onClick={toggleCurrency}
      className="min-w-9 px-2 text-xs font-bold"
    >
      {currency === 'USD' ? <CircleDollarSignIcon className="size-5" /> : 'KES'}
    </Button>
  )
}
