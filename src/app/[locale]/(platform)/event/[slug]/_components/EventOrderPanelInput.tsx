import type { RefObject } from 'react'
import type { OrderSide } from '@/types'
import { useExtracted } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import { formatDisplayAmount, getAmountSizeClass, MAX_AMOUNT_INPUT, sanitizeNumericInput } from '@/lib/amount-input'
import { ORDER_SIDE } from '@/lib/constants'
import { formatAmountInputValue } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import { usePortfolioValueVisibility } from '@/stores/usePortfolioValueVisibility'

interface BalanceSummary {
  raw: number
  text: string
  symbol?: string
}

interface EventOrderPanelInputProps {
  isMobile: boolean
  side: OrderSide
  amount: string
  amountNumber: number
  availableShares: number
  balance: BalanceSummary
  isBalanceLoading?: boolean
  inputRef: RefObject<HTMLInputElement | null>
  onAmountChange: (value: string) => void
  shouldShake?: boolean
}

export default function EventOrderPanelInput({
  isMobile,
  side,
  amount,
  amountNumber,
  availableShares,
  balance,
  isBalanceLoading = false,
  inputRef,
  onAmountChange,
  shouldShake,
}: EventOrderPanelInputProps) {
  const t = useExtracted()
  const { currency, kesPerUsdc, formatMoney } = useDisplayCurrency()
  const areValuesHidden = usePortfolioValueVisibility(state => state.isHidden)

  function focusInput() {
    inputRef?.current?.focus()
  }

  function handleInputChange(rawValue: string) {
    const cleaned = sanitizeNumericInput(rawValue)

    if (side === ORDER_SIDE.SELL) {
      onAmountChange(cleaned)
      return
    }

    const numericValue = Number.parseFloat(cleaned)

    if (cleaned === '' || numericValue <= MAX_AMOUNT_INPUT) {
      onAmountChange(cleaned)
    }
  }

  function handleBlur() {
    if (side === ORDER_SIDE.SELL) {
      const cleaned = sanitizeNumericInput(amount)
      const numeric = Number.parseFloat(cleaned)
      if (!cleaned || Number.isNaN(numeric)) {
        onAmountChange('')
        return
      }
      onAmountChange(formatAmountInputValue(numeric))
    }
    else {
      if (amountNumber <= 0) {
        onAmountChange('')
        return
      }
      onAmountChange(formatAmountInputValue(amountNumber))
    }
  }

  function incrementAmount(delta: number) {
    const nextValue = amountNumber + delta

    if (side === ORDER_SIDE.SELL) {
      onAmountChange(formatAmountInputValue(nextValue))
      return
    }

    const limitedValue = Math.min(nextValue, MAX_AMOUNT_INPUT)
    onAmountChange(formatAmountInputValue(limitedValue))
  }

  function decrementAmount(delta: number) {
    const nextValue = Math.max(0, amountNumber - delta)
    onAmountChange(formatAmountInputValue(nextValue))
  }

  function handleBalanceClick() {
    if (side === ORDER_SIDE.SELL) {
      return
    }

    // Balance is always in KES (authoritative currency)
    const maxBalanceKes = Number.isFinite(balance.raw) ? balance.raw : 0
    // Convert KES to USD for the input (since AMM expects USD)
    const maxBalanceUsd = maxBalanceKes / kesPerUsdc
    const limitedBalance = Math.min(maxBalanceUsd, MAX_AMOUNT_INPUT)
    // Format to 2 decimal places for USD input
    onAmountChange(formatAmountInputValue(limitedBalance))
    focusInput()
  }

  function renderActionButtons() {
    if (side === ORDER_SIDE.SELL) {
      const isDisabled = availableShares <= 0
      return ['25%', '50%', '75%'].map(percentage => (
        <Button
          type="button"
          key={percentage}
          size="sm"
          variant="outline"
          className={cn(
            'text-xs',
            { 'cursor-not-allowed opacity-50': isDisabled },
          )}
          disabled={isDisabled}
          onClick={() => {
            if (isDisabled) {
              return
            }

            const percentValue = Number.parseInt(percentage.replace('%', ''), 10) / 100
            const newValue = availableShares * percentValue
            onAmountChange(formatAmountInputValue(newValue))
            focusInput()
          }}
        >
          {percentage}
        </Button>
      ))
    }

    if (side === ORDER_SIDE.BUY) {
      const isDisabled = !Number.isFinite(balance.raw) || balance.raw <= 0
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            'text-xs',
            { 'cursor-not-allowed opacity-50': isDisabled },
          )}
          disabled={isDisabled}
          onClick={handleBalanceClick}
        >
          MAX
        </Button>
      )
    }

    return null
  }

  const amountSizeClass = getAmountSizeClass(amount)
  const formattedBalanceText = formatMoney(Number.isFinite(balance.raw) ? balance.raw : 0)

  const formattedAmount = formatDisplayAmount(amount)
  const inputValue = side === ORDER_SIDE.SELL
    ? formattedAmount
    : formattedAmount ? `${currency === 'KES' ? 'KES ' : '$'}${formattedAmount}` : ''
  return (
    <>
      {isMobile
        ? (
            <div className="mb-4">
              <div className="mb-4 flex items-center justify-center gap-4">
                <Button
                  type="button"
                  onClick={() => decrementAmount(side === ORDER_SIDE.SELL ? 0.1 : 1)}
                  size="icon"
                  variant="ghost"
                >
                  −
                </Button>
                <div className="flex-1 text-center">
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="decimal"
                    className={cn(
                      `
                        w-full [appearance:textfield] border-0 bg-transparent text-center font-semibold text-foreground
                        placeholder-muted-foreground outline-hidden
                        [&::-webkit-inner-spin-button]:appearance-none
                        [&::-webkit-outer-spin-button]:appearance-none
                      `,
                      amountSizeClass,
                      { 'animate-order-shake': shouldShake },
                    )}
                    placeholder={side === ORDER_SIDE.SELL ? '0' : currency === 'KES' ? 'KES 0' : '$0'}
                    value={inputValue}
                    onChange={e => handleInputChange(e.target.value)}
                    onBlur={handleBlur}
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => incrementAmount(side === ORDER_SIDE.SELL ? 0.1 : 1)}
                  size="icon"
                  variant="ghost"
                >
                  +
                </Button>
              </div>
            </div>
          )
        : (
            <div className="mb-2 flex items-center gap-3">
              <div className="shrink-0">
                <div className="text-lg font-medium">
                  {side === ORDER_SIDE.SELL ? t('Shares') : t('Amount')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {side === ORDER_SIDE.SELL
                    ? null
                    : isBalanceLoading
                      ? <Skeleton className="inline-block h-3 w-16 align-middle" />
                      : (
                          <button
                            type="button"
                            className={cn(`
                              cursor-pointer bg-transparent p-0 text-left transition-colors
                              hover:text-foreground
                            `)}
                            onClick={handleBalanceClick}
                          >
                            {t('Balance')}
                            {' '}
                            {areValuesHidden ? '****' : formattedBalanceText}
                          </button>
                        )}
                </div>
              </div>
              <div className="relative flex-1 min-w-0 overflow-hidden">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="decimal"
                  className={cn(
                    `
                      h-14 w-full [appearance:textfield] border-0 bg-transparent text-right font-semibold text-slate-700
                      placeholder-slate-400 outline-hidden tracking-tight truncate min-w-0
                      dark:text-slate-300 dark:placeholder-slate-500
                      [&::-webkit-inner-spin-button]:appearance-none
                      [&::-webkit-outer-spin-button]:appearance-none
                    `,
                    amountSizeClass,
                    { 'animate-order-shake': shouldShake },
                  )}
                  placeholder={side === ORDER_SIDE.SELL ? '0' : currency === 'KES' ? 'KES 0' : '$0'}
                  value={inputValue}
                  onChange={e => handleInputChange(e.target.value)}
                  onBlur={handleBlur}
                />
              </div>
            </div>
          )}

      <div
        className={cn(
          'my-2 flex justify-end gap-2 px-1',
        )}
      >
        {renderActionButtons()}
      </div>
    </>
  )
}
