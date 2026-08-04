'use client'

import type { FormEvent } from 'react'
import type { TellwiseRampInitiateResponse } from '@/lib/tellwise-service-contracts'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRightIcon, CheckIcon, ChevronRightIcon, InfoIcon, Loader2Icon, TriangleAlertIcon, WalletIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import KenyanFlagIcon from '@/components/KenyanFlagIcon'
import SiteLogoIcon from '@/components/SiteLogoIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useSiteIdentity } from '@/hooks/useSiteIdentity'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import { SLIMEFISH_BACKEND_BALANCE_QUERY_KEY, useBalance } from '@/hooks/useBalance'
import { normalizeKenyanPhone } from '@/lib/kenyan-phone'
import { formatDisplayAmount, sanitizeNumericInput } from '@/lib/amount-input'
import { calculateEstimatedNetDepositKes, estimatePaymentGatewayFeeKes, formatKesAmountInput, MAX_MPESA_DEPOSIT_KES, sanitizeKesAmountInput } from '@/lib/mpesa-money'
import { cn } from '@/lib/utils'
import WalletTransactionTimeline from './WalletTransactionTimeline'

export interface WalletOnrampProgress {
  status: 'submitting' | 'pending' | 'completed' | 'failed'
  phoneNumber: string
  netAmount: number
  response?: TellwiseRampInitiateResponse | null
  error?: string
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (/failed query|insert into|params:|duplicate key|violates|database/i.test(error.message)) {
      return fallback
    }
    return error.message
  }
  return fallback
}

export function WalletOnrampForm({
  walletAddress,
  defaultPhoneNumber,
  progress,
  onProgressChange,
}: {
  walletAddress?: string | null
  defaultPhoneNumber?: string
  progress?: WalletOnrampProgress | null
  onProgressChange?: (progress: WalletOnrampProgress | null) => void
}) {
  const site = useSiteIdentity()
  const queryClient = useQueryClient()
  const { currency, kesPerUsdc, formatMoney } = useDisplayCurrency()
  const { balance: userBalance } = useBalance()
  const minDepositKes = userBalance?.minimumDepositKes || 130
  const [fiatAmount, setFiatAmount] = useState('')
  const [phoneNumber, setPhoneNumber] = useState(defaultPhoneNumber ?? '')
  const [deposit, setDeposit] = useState<TellwiseRampInitiateResponse | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [isEditingPhone, setIsEditingPhone] = useState(!defaultPhoneNumber)
  const [isFeeDetailsOpen, setIsFeeDetailsOpen] = useState(false)
  const [showAmountWarning, setShowAmountWarning] = useState(false)
  const phoneInputRef = useRef<HTMLInputElement>(null)
  const previousCurrencyRef = useRef(currency)

  const numericAmount = useMemo(() => Number.parseFloat(fiatAmount), [fiatAmount])
  const amountKes = currency === 'KES' ? numericAmount : numericAmount * kesPerUsdc
  const normalizedPhone = useMemo(() => normalizeKenyanPhone(phoneNumber), [phoneNumber])
  const feeAmount = useMemo(() => estimatePaymentGatewayFeeKes(amountKes), [amountKes])
  const netDepositAmount = useMemo(() => calculateEstimatedNetDepositKes(amountKes), [amountKes])
  const minimumDisplayAmount = currency === 'KES' ? minDepositKes : minDepositKes / kesPerUsdc
  const maximumDisplayAmount = currency === 'KES' ? MAX_MPESA_DEPOSIT_KES : MAX_MPESA_DEPOSIT_KES / kesPerUsdc
  const canSubmit = !isSubmitting
    && Number.isFinite(numericAmount)
    && numericAmount >= minimumDisplayAmount
    && numericAmount <= maximumDisplayAmount
    && Boolean(normalizedPhone)
    && !(Boolean(defaultPhoneNumber) && isEditingPhone)
  const amountValidationMessage = Number.isFinite(numericAmount) && numericAmount > 0 && numericAmount < minimumDisplayAmount
    ? `Minimum deposit is ${formatMoney(minDepositKes)}.`
    : Number.isFinite(numericAmount) && numericAmount > maximumDisplayAmount
      ? `Maximum deposit is ${formatMoney(MAX_MPESA_DEPOSIT_KES)}.`
      : ''

  useEffect(() => {
    const previousCurrency = previousCurrencyRef.current
    if (previousCurrency === currency) return
    previousCurrencyRef.current = currency
    setFiatAmount((current) => {
      const value = Number.parseFloat(current)
      if (!Number.isFinite(value)) return ''
      const converted = currency === 'KES' ? value * kesPerUsdc : value / kesPerUsdc
      return currency === 'KES' ? String(Math.floor(converted)) : converted.toFixed(2)
    })
  }, [currency, kesPerUsdc])

  useEffect(() => {
    setShowAmountWarning(false)
    if (!amountValidationMessage) return
    const timer = window.setTimeout(() => setShowAmountWarning(true), 900)
    return () => window.clearTimeout(timer)
  }, [amountValidationMessage])

  useEffect(() => {
    setPhoneNumber(defaultPhoneNumber ?? '')
    setIsEditingPhone(!defaultPhoneNumber)
  }, [defaultPhoneNumber])

  useEffect(() => {
    const depositId = progress?.response?.depositId
    if (!depositId || progress?.status !== 'pending') return
    let cancelled = false
    const check = async () => {
      const response = await fetch(`/api/payments/${encodeURIComponent(depositId)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (cancelled || !response.ok || !payload?.data) return
      const status = String(payload.data.status)
      if (status === 'SUCCEEDED') {
        onProgressChange?.({ ...progress, status: 'completed', netAmount: Number(payload.data.netAmount || progress.netAmount) })
        await queryClient.invalidateQueries({ queryKey: [SLIMEFISH_BACKEND_BALANCE_QUERY_KEY] })
      }
      else if (status === 'FAILED' || status === 'EXPIRED') {
        onProgressChange?.({ ...progress, status: 'failed', error: payload.data.failureMessage || 'The deposit was not completed.' })
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), 3_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [onProgressChange, progress, queryClient])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) {
      setError(`Enter a valid Kenyan phone number and an amount from ${formatMoney(minDepositKes)} to ${formatMoney(MAX_MPESA_DEPOSIT_KES)}.`)
      return
    }

    setIsSubmitting(true)
    setError('')
    setHasSubmitted(true)
    onProgressChange?.({
      status: 'submitting',
      phoneNumber: normalizedPhone!,
      netAmount: netDepositAmount,
      response: null,
    })
    try {
      const response = await fetch('/api/deposits/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fiatAmount: String(amountKes),
          amountCurrency: currency === 'USD' ? 'USDC' : 'KES',
          phoneNumber: normalizedPhone!,
          walletAddress,
        }),
      })
      const text = await response.text()
      let body: any = null
      try {
        body = text ? JSON.parse(text) : null
      }
      catch {
        body = null
      }
      if (!response.ok) {
        throw new Error(body?.error || (text.trim().startsWith('<') ? 'The deposit service returned an unreadable response. Please try again.' : 'Unable to start deposit.'))
      }
      if (!body) {
        throw new Error('The deposit response was invalid. Please try again.')
      }
      setDeposit(body as TellwiseRampInitiateResponse)
      onProgressChange?.({
        status: 'pending',
        phoneNumber: normalizedPhone!,
        netAmount: netDepositAmount,
        response: body as TellwiseRampInitiateResponse,
      })
    }
    catch (submitError) {
      const message = getErrorMessage(submitError, 'Unable to start deposit.')
      setDeposit(null)
      setError(message)
      onProgressChange?.({
        status: 'failed',
        phoneNumber: normalizedPhone!,
        netAmount: netDepositAmount,
        response: null,
        error: message,
      })
    }
    finally {
      setIsSubmitting(false)
    }
  }

  function handleTryAgain() {
    setDeposit(null)
    setError('')
    setHasSubmitted(false)
    onProgressChange?.(null)
  }

  const activeProgress = progress ?? null
  const shouldShowTimeline = Boolean(activeProgress) || (hasSubmitted && (isSubmitting || deposit || error))

  if (shouldShowTimeline) {
    const hasFailed = activeProgress?.status === 'failed' || Boolean(error)
    const hasCompleted = activeProgress?.status === 'completed'
    const timelinePhone = activeProgress?.phoneNumber ?? normalizedPhone
    const timelineNetAmount = activeProgress?.netAmount ?? netDepositAmount
    const timelineDeposit = activeProgress?.response ?? deposit
    const timelineError = activeProgress?.error ?? error
    const timeline = [
      {
        title: 'Initiating transaction',
        description: 'Request created.',
        status: hasFailed ? 'failed' : 'complete',
      },
      {
        title: 'M-Pesa prompt',
        description: timelineDeposit ? 'Sent to your phone.' : hasFailed ? 'Prompt failed.' : 'Sending prompt.',
        status: timelineDeposit ? 'complete' : hasFailed ? 'failed' : 'active',
      },
      {
        title: 'Payment confirmation',
        description: hasCompleted ? 'Funds added to your balance.' : timelineDeposit ? 'Waiting for settlement.' : 'Pending.',
        status: hasCompleted ? 'complete' : timelineDeposit ? 'active' : 'pending',
      },
    ] as const

    return (
      <WalletTransactionTimeline
        title={hasFailed ? 'Deposit failed' : hasCompleted ? 'Deposit complete' : 'Awaiting transaction'}
        description={hasFailed ? timelineError : `Deposit to ${timelinePhone || 'your phone'}`}
        amount={hasFailed ? undefined : formatMoney(timelineNetAmount)}
        steps={timeline}
        failed={hasFailed}
        onRetry={handleTryAgain}
      />
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border p-4">
      <div className="mb-4 flex flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-md bg-primary/10 text-primary">
            <WalletIcon className="size-7" />
          </div>
          <ArrowRightIcon className="size-5 text-muted-foreground" />
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
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">M-Pesa deposit</p>
          <p className="text-xs text-muted-foreground">Enter Kenyan shillings and your phone number.</p>
        </div>
      </div>

      <div className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Amount</span>
          <div className="flex items-center rounded-md border px-3">
            <span className="text-sm font-semibold text-muted-foreground">{currency === 'KES' ? 'KES' : 'USD'}</span>
            <Input
              value={currency === 'KES' ? formatKesAmountInput(fiatAmount) : formatDisplayAmount(fiatAmount)}
              onChange={event => setFiatAmount(currency === 'KES' ? sanitizeKesAmountInput(event.target.value) : sanitizeNumericInput(event.target.value))}
              inputMode="decimal"
              className="h-11 border-0 text-right text-lg font-semibold shadow-none focus-visible:ring-0"
            />
          </div>
          {currency === 'USD' && Number.isFinite(amountKes) && amountKes > 0 && (
            <span className="text-xs text-muted-foreground">
              M-Pesa prompt: Ksh {formatKesAmountInput(String(Math.floor(amountKes)))}
            </span>
          )}
          {showAmountWarning && (
            <span className="flex animate-order-shake items-center gap-2 text-xs font-semibold text-orange-500">
              <TriangleAlertIcon className="size-3.5 shrink-0" />
              {amountValidationMessage}
            </span>
          )}
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Phone number</span>
          <div className="flex h-11 items-center rounded-md border border-input bg-background px-3 shadow-xs">
            <KenyanFlagIcon className="mr-2 shrink-0" />
            <Input
              ref={phoneInputRef}
              value={phoneNumber}
              onChange={event => setPhoneNumber(event.target.value)}
              inputMode="tel"
              placeholder="07xx xxx xxx"
              readOnly={!isEditingPhone}
              className={cn('h-9 border-0 px-0 shadow-none focus-visible:ring-0', isEditingPhone && 'rounded-sm ring-2 ring-primary/40')}
            />
            {!isEditingPhone && (
              <button
                type="button"
                className="ml-2 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setIsEditingPhone(true)
                  window.setTimeout(() => phoneInputRef.current?.focus(), 0)
                }}
              >
                Change
              </button>
            )}
            {isEditingPhone && defaultPhoneNumber && (
              <div className="ml-2 flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Cancel phone number change"
                  onClick={() => {
                    setPhoneNumber(defaultPhoneNumber)
                    setIsEditingPhone(false)
                  }}
                >
                  <XIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-primary"
                  aria-label="Confirm phone number change"
                  disabled={!normalizedPhone}
                  onClick={() => setIsEditingPhone(false)}
                >
                  <CheckIcon className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </label>

        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">You receive</span>
            <span className="font-medium">{formatMoney(netDepositAmount)}</span>
          </div>
          <button
            type="button"
            className="mt-2 flex w-full items-center justify-between text-xs text-muted-foreground"
            onClick={() => setIsFeeDetailsOpen(current => !current)}
          >
            <span>Fee structure</span>
            <ChevronRightIcon className={isFeeDetailsOpen ? 'size-4 rotate-90 transition' : 'size-4 transition'} />
          </button>
          {isFeeDetailsOpen && (
            <TooltipProvider>
              <div className="mt-2 space-y-1 border-t border-border/60 pt-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        You pay
                        <InfoIcon className="size-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>The total amount sent through the payment provider.</TooltipContent>
                  </Tooltip>
                  <span className="font-medium">{formatMoney(amountKes)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        Payment gateway fee
                        <InfoIcon className="size-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Slimefish covers this payment-provider fee, so your full deposit is added to your balance.</TooltipContent>
                  </Tooltip>
                  <span className="font-medium">{formatMoney(feeAmount)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        Gas fee
                        <InfoIcon className="size-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Network costs for settlement. Local testing may show zero.</TooltipContent>
                  </Tooltip>
                  <span className="font-medium">{formatMoney(0)}</span>
                </div>
              </div>
            </TooltipProvider>
          )}
        </div>

        {error && (
          <p className="flex animate-order-shake items-center gap-2 text-xs font-semibold text-orange-500">
            <TriangleAlertIcon className="size-3.5 shrink-0" />
            {error}
          </p>
        )}
        <Button type="submit" className="h-11 w-full" disabled={!canSubmit}>
          {isSubmitting && <Loader2Icon className="mr-2 size-4 animate-spin" />}
          Start deposit
        </Button>
      </div>
    </form>
  )
}
