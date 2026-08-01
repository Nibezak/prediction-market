'use client'

import type { ChangeEventHandler, FormEventHandler } from 'react'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronRightIcon,
  FuelIcon,
  InfoIcon,
  TriangleAlertIcon,
  WalletIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import KenyanFlagIcon from '@/components/KenyanFlagIcon'
import SiteLogoIcon from '@/components/SiteLogoIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDisplayAmount, MAX_AMOUNT_INPUT, sanitizeNumericInput } from '@/lib/amount-input'
import { formatAmountInputValue } from '@/lib/formatters'
import { normalizeKenyanPhone } from '@/lib/kenyan-phone'
import { calculateMinisendFeeKes, formatKesMoney, MAX_MPESA_DEPOSIT_KES, MIN_MPESA_WITHDRAWAL_KES } from '@/lib/mpesa-money'
import { cn } from '@/lib/utils'
import { useSiteIdentity } from '@/hooks/useSiteIdentity'
import WalletTransactionTimeline from './WalletTransactionTimeline'

function WalletSendForm({
  sendTo,
  onChangeSendTo,
  sendAmount,
  onChangeSendAmount,
  isSending,
  isSubmitted = false,
  error = '',
  onRetrySend,
  onSubmitSend,
  onBack,
  availableBalance,
  onMax,
  isBalanceLoading = false,
  defaultPhoneNumber,
}: {
  sendTo: string
  onChangeSendTo: ChangeEventHandler<HTMLInputElement>
  sendAmount: string
  onChangeSendAmount: (value: string) => void
  isSending: boolean
  isSubmitted?: boolean
  error?: string
  onRetrySend?: () => void
  onSubmitSend: FormEventHandler<HTMLFormElement>
  onBack?: () => void
  connectedWalletAddress?: string | null
  onUseConnectedWallet?: () => void
  availableBalance?: number | null
  onMax?: () => void
  isBalanceLoading?: boolean
  defaultPhoneNumber?: string
}) {
  const site = useSiteIdentity()
  const trimmedRecipient = sendTo.trim()
  const normalizedPhone = normalizeKenyanPhone(trimmedRecipient)
  const parsedAmount = Number(sendAmount)
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false)
  const [showAmountWarning, setShowAmountWarning] = useState(false)
  const inputValue = formatDisplayAmount(sendAmount)
  const feeAmount = calculateMinisendFeeKes(parsedAmount)
  const receiveAmount = Number.isFinite(parsedAmount) ? Math.max(0, parsedAmount - feeAmount) : 0
  const amountValidationMessage = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount < MIN_MPESA_WITHDRAWAL_KES
    ? `Minimum withdrawal is KES ${MIN_MPESA_WITHDRAWAL_KES.toLocaleString('en-US')}.`
    : Number.isFinite(parsedAmount) && parsedAmount > MAX_MPESA_DEPOSIT_KES
      ? `Maximum withdrawal is KES ${MAX_MPESA_DEPOSIT_KES.toLocaleString('en-US')}.`
      : ''
  const isSubmitDisabled = (
    isSending
    || isSubmitted
    || !trimmedRecipient
    || !normalizedPhone
    || !Number.isFinite(parsedAmount)
    || parsedAmount < MIN_MPESA_WITHDRAWAL_KES
    || parsedAmount > MAX_MPESA_DEPOSIT_KES
  )
  const amountDisplay = Number.isFinite(parsedAmount)
    ? formatKesMoney(parsedAmount)
    : formatKesMoney(0)
  const formattedBalance = Number.isFinite(availableBalance)
    ? formatKesMoney(availableBalance)
    : formatKesMoney(0)
  const balanceDisplay = isBalanceLoading
    ? <Skeleton className="h-4 w-16" />
    : formattedBalance

  useEffect(() => {
    setShowAmountWarning(false)
    if (!amountValidationMessage) return
    const timer = window.setTimeout(() => setShowAmountWarning(true), 900)
    return () => window.clearTimeout(timer)
  }, [amountValidationMessage])

  function handleAmountChange(rawValue: string) {
    const cleaned = sanitizeNumericInput(rawValue)
    const numericValue = Number.parseFloat(cleaned)

    if (cleaned === '' || numericValue <= MAX_AMOUNT_INPUT) {
      onChangeSendAmount(cleaned)
    }
  }

  function handleAmountBlur(rawValue: string) {
    const cleaned = sanitizeNumericInput(rawValue)
    const numeric = Number.parseFloat(cleaned)

    if (!cleaned || Number.isNaN(numeric)) {
      onChangeSendAmount('')
      return
    }

    const clampedValue = Math.min(numeric, MAX_AMOUNT_INPUT)
    onChangeSendAmount(formatAmountInputValue(clampedValue))
  }

  if (isSending || isSubmitted || error) {
    const hasFailed = Boolean(error)
    const timeline = [
      {
        title: 'Initiating withdrawal',
        description: 'Funds reserved.',
        status: hasFailed ? 'failed' : 'complete',
      },
      {
        title: 'Create payout order',
        description: isSubmitted ? 'Order created.' : hasFailed ? 'Order failed.' : 'Creating order.',
        status: isSubmitted ? 'complete' : hasFailed ? 'failed' : 'active',
      },
      {
        title: 'Treasury funding',
        description: isSubmitted ? 'Waiting for funding.' : 'Pending.',
        status: isSubmitted ? 'active' : 'pending',
      },
      {
        title: 'M-Pesa confirmation',
        description: 'Pending.',
        status: 'pending',
      },
    ] as const

    return (
      <WalletTransactionTimeline
        title={hasFailed ? 'Withdrawal could not start' : 'Awaiting payout'}
        description={hasFailed ? error : `Withdrawal to ${normalizedPhone ?? 'your phone'}`}
        amount={hasFailed ? undefined : formatKesMoney(receiveAmount)}
        steps={timeline}
        failed={hasFailed}
        onRetry={onRetrySend}
      />
    )
  }

  return (
    <div className="space-y-5">
      {onBack && (
        <button
          type="button"
          className="flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
          onClick={onBack}
        >
          <ArrowLeftIcon className="size-4" />
          Back
        </button>
      )}

      <form className="mt-2 grid gap-4" onSubmit={onSubmitSend}>
        <div className="mb-1 flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-md bg-primary/10 text-primary">
              <SiteLogoIcon
                logoSvg={site.logoSvg}
                logoImageUrl={site.logoImageUrl}
                alt={`${site.name} logo`}
                size={34}
                className="size-8"
                imageClassName="size-8 object-contain"
              />
            </div>
            <ArrowRightIcon className="size-5 text-muted-foreground" />
            <div className="flex size-12 items-center justify-center rounded-md bg-primary/10 text-primary">
              <WalletIcon className="size-7" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">M-Pesa withdrawal</p>
            <p className="text-xs text-muted-foreground">Send Kenyan shillings to your phone number.</p>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="wallet-send-to">M-Pesa phone number</Label>
          <div className="flex h-12 items-center rounded-md border border-input bg-background px-3 shadow-xs">
            <KenyanFlagIcon className="mr-2 shrink-0" />
            <Input
              id="wallet-send-to"
              value={sendTo}
              onChange={onChangeSendTo}
              placeholder={defaultPhoneNumber || '+254, 07, 254, or 7...'}
              inputMode="tel"
              className="h-10 border-0 px-0 text-sm shadow-none placeholder:text-sm focus-visible:ring-0"
              required
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="wallet-send-amount">Amount</Label>
          <div className="relative">
            <Input
              id="wallet-send-amount"
              type="text"
              inputMode="decimal"
              value={inputValue}
              onChange={event => handleAmountChange(event.target.value)}
              onBlur={event => handleAmountBlur(event.target.value)}
              placeholder="0.00"
              className={cn(`
                h-12 [appearance:textfield] pr-36 text-sm
                [&::-webkit-inner-spin-button]:appearance-none
                [&::-webkit-outer-spin-button]:appearance-none
              `)}
              required
            />
            <div className="absolute inset-y-2 right-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">KES</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs text-foreground hover:text-muted-foreground"
                onClick={onMax}
                disabled={!onMax || isBalanceLoading}
              >
                Max
              </Button>
            </div>
          </div>
          <div className="mx-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{amountDisplay}</span>
            <span className="flex items-center gap-1">
              <span>Balance:</span>
              <span>{balanceDisplay}</span>
            </span>
          </div>
          {showAmountWarning && (
            <div className="mx-2 flex animate-order-shake items-center gap-2 text-xs font-semibold text-orange-500">
              <TriangleAlertIcon className="size-3.5 shrink-0" />
              {amountValidationMessage}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">M-Pesa payout</span>
              <div className="flex items-center gap-3 text-right">
              <span className="text-muted-foreground">{formatKesMoney(receiveAmount)}</span>
              </div>
            </div>
          <button
            type="button"
            className="flex w-full items-center justify-between text-sm text-muted-foreground"
            onClick={() => setIsBreakdownOpen(current => !current)}
          >
            <span>Transaction breakdown</span>
            <span className="flex items-center gap-1">
              {!isBreakdownOpen && <span>0.00%</span>}
              <ChevronRightIcon
                className={cn('size-4 transition', { 'rotate-90': isBreakdownOpen })}
              />
            </span>
          </button>
          {isBreakdownOpen && (
            <TooltipProvider>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2">
                        <span>Network cost</span>
                        <InfoIcon className="size-4" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-1 text-xs text-foreground">
                        <div className="flex items-center justify-between gap-4">
                          <span>Total cost</span>
                          <span className="text-right">{formatKesMoney(feeAmount)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Payment gateway fee</span>
                          <span className="text-right">{formatKesMoney(feeAmount)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Destination chain gas</span>
                          <span className="text-right">$0.00</span>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                  <div className="flex items-center gap-1">
                    <FuelIcon className="size-4" />
                    <span>{formatKesMoney(feeAmount)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2">
                        <span>Price impact</span>
                        <InfoIcon className="size-4" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-1 text-xs text-foreground">
                        <div className="flex items-center justify-between gap-4">
                          <span>Total impact</span>
                          <span className="text-right">0.00%</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Swap impact</span>
                          <span className="text-right">0.00%</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Payment gateway fee</span>
                          <span className="text-right">0.00%</span>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                  <span>0.00%</span>
                </div>
                <div className="flex items-center justify-between">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2">
                        <span>Max slippage</span>
                        <InfoIcon className="size-4" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      Slippage occurs due to price changes during trade execution. Minimum received: {formatKesMoney(receiveAmount)}
                    </TooltipContent>
                  </Tooltip>
                  <span>Auto - 0.00%</span>
                </div>
              </div>
            </TooltipProvider>
          )}
        </div>

        <Button type="submit" className="h-12 w-full gap-2 text-base" disabled={isSubmitDisabled}>
          {isSending ? 'Submitting...' : 'Withdraw'}
        </Button>
      </form>
    </div>
  )
}

export default WalletSendForm
