'use client'

import type { FormEvent } from 'react'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronRightIcon,
  FuelIcon,
  InfoIcon,
  TriangleAlertIcon,
  WalletIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import KenyanFlagIcon from '@/components/KenyanFlagIcon'
import SiteLogoIcon from '@/components/SiteLogoIcon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasscodeInput } from '@/components/ui/passcode-input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDisplayAmount, MAX_AMOUNT_INPUT, sanitizeNumericInput } from '@/lib/amount-input'
import { formatAmountInputValue } from '@/lib/formatters'
import { normalizeKenyanPhone } from '@/lib/kenyan-phone'
import { calculateMaximumWithdrawalRecipientKes, MAX_MPESA_DEPOSIT_KES, MIN_MPESA_WITHDRAWAL_KES, quoteWithdrawalKes } from '@/lib/mpesa-money'
import { cn } from '@/lib/utils'
import { useSiteIdentity } from '@/hooks/useSiteIdentity'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import { useBalance } from '@/hooks/useBalance'
import WalletTransactionTimeline from './WalletTransactionTimeline'

function WalletSendForm({
  sendTo,
  onChangeSendTo,
  sendAmount,
  onChangeSendAmount,
  isSending,
  isSubmitted = false,
  settlementStatus = 'pending',
  error = '',
  onRetrySend,
  onSubmitSend,
  onBack,
  availableBalance,
  formattedBalance,
  onMax,
  isBalanceLoading = false,
  defaultPhoneNumber,
  withdrawalPin = '',
  onWithdrawalPinChange = () => {},
}: {
  sendTo: string
  onChangeSendTo: (value: string) => void
  sendAmount: string
  onChangeSendAmount: (value: string) => void
  isSending: boolean
  isSubmitted?: boolean
  settlementStatus?: 'pending' | 'completed' | 'failed'
  error?: string
  onRetrySend?: () => void
  onSubmitSend: () => void | Promise<void>
  onBack?: () => void
  connectedWalletAddress?: string | null
  onUseConnectedWallet?: () => void
  availableBalance?: number | null
  formattedBalance?: string
  onMax?: () => void
  isBalanceLoading?: boolean
  defaultPhoneNumber?: string
  withdrawalPin: string
  onWithdrawalPinChange: (value: string) => void
}) {
  const site = useSiteIdentity()
  const { currency, kesPerUsdc, formatMoney } = useDisplayCurrency()
  const { balance: userBalance } = useBalance()
  const minWithdrawalKes = userBalance?.minimumDepositKes || 10
  const trimmedRecipient = sendTo.trim()
  const normalizedPhone = normalizeKenyanPhone(trimmedRecipient)
  const parsedAmount = Number(sendAmount)
  const amountKes = currency === 'KES' ? parsedAmount : parsedAmount * kesPerUsdc
  const availableDisplayBalance = currency === 'KES'
    ? Math.max(0, availableBalance ?? 0)
    : Math.max(0, availableBalance ?? 0) / kesPerUsdc
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false)
  const [showAmountWarning, setShowAmountWarning] = useState(false)
  const [phoneChangeStep, setPhoneChangeStep] = useState<'idle' | 'verify' | 'edit' | 'changed'>(defaultPhoneNumber ? 'idle' : 'edit')
  const [passcodeError, setPasscodeError] = useState('')
  const [isVerifyingPasscode, setIsVerifyingPasscode] = useState(false)
  const [phoneChangeAuthorizationOpen, setPhoneChangeAuthorizationOpen] = useState(false)
  const [withdrawalAuthorizationOpen, setWithdrawalAuthorizationOpen] = useState(false)
  const [withdrawalAuthorizationError, setWithdrawalAuthorizationError] = useState('')
  const phoneInputRef = useRef<HTMLInputElement>(null)
  const previousCurrencyRef = useRef(currency)
  const isChangingPhone = Boolean(normalizedPhone && defaultPhoneNumber && normalizedPhone !== normalizeKenyanPhone(defaultPhoneNumber))
  const inputValue = formatDisplayAmount(sendAmount)
  const withdrawalQuote = quoteWithdrawalKes(amountKes)
  const feeAmountKes = withdrawalQuote.providerFee + withdrawalQuote.platformFee
  const receiveAmountKes = withdrawalQuote.recipientAmount
  const totalDebitKes = withdrawalQuote.gross
  const maximumRecipientKes = calculateMaximumWithdrawalRecipientKes(availableBalance ?? 0)
  const maximumRecipientDisplay = currency === 'KES' ? maximumRecipientKes : maximumRecipientKes / kesPerUsdc
  const hasInsufficientBalance = !isBalanceLoading
    && Number.isFinite(parsedAmount)
    && totalDebitKes > Math.max(0, availableBalance ?? 0)
  const minimumDisplayAmount = currency === 'KES' ? minWithdrawalKes : minWithdrawalKes / kesPerUsdc
  const maximumDisplayAmount = currency === 'KES' ? MAX_MPESA_DEPOSIT_KES : MAX_MPESA_DEPOSIT_KES / kesPerUsdc
  const amountValidationMessage = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount < minimumDisplayAmount
    ? `Minimum withdrawal is ${formatMoney(minWithdrawalKes)}.`
    : Number.isFinite(parsedAmount) && parsedAmount > maximumDisplayAmount
      ? `Maximum withdrawal is ${formatMoney(MAX_MPESA_DEPOSIT_KES)}.`
      : hasInsufficientBalance
        ? `Insufficient balance. The most you can withdraw is ${formatMoney(maximumRecipientKes)}.`
        : ''
  const isSubmitDisabled = (
    isSending
    || isSubmitted
    || !trimmedRecipient
    || !normalizedPhone
    || !Number.isFinite(parsedAmount)
    || parsedAmount < minimumDisplayAmount
    || parsedAmount > maximumDisplayAmount
    || hasInsufficientBalance
    || (isChangingPhone && !/^\d{4}$/.test(withdrawalPin))
  )
  const amountDisplay = Number.isFinite(parsedAmount)
    ? formatMoney(amountKes)
    : formatMoney(0)
  const balanceDisplay = isBalanceLoading
    ? <Skeleton className="h-4 w-16" />
    : (formattedBalance ?? formatMoney(availableBalance))

  useEffect(() => {
    const previousCurrency = previousCurrencyRef.current
    if (previousCurrency === currency) return
    previousCurrencyRef.current = currency
    onChangeSendAmount((() => {
      const value = Number.parseFloat(sendAmount)
      if (!Number.isFinite(value)) return ''
      const converted = currency === 'KES' ? value * kesPerUsdc : value / kesPerUsdc
      return currency === 'KES' ? String(Math.floor(converted)) : converted.toFixed(2)
    })())
  }, [currency, kesPerUsdc, onChangeSendAmount, sendAmount])

  useEffect(() => {
    setShowAmountWarning(false)
    if (!amountValidationMessage) return
    const timer = window.setTimeout(() => setShowAmountWarning(true), 1000)
    return () => window.clearTimeout(timer)
  }, [amountValidationMessage])

  useEffect(() => {
    if (defaultPhoneNumber && !sendTo) {
      onChangeSendTo(defaultPhoneNumber)
      setPhoneChangeStep('idle')
    }
  }, [defaultPhoneNumber, onChangeSendTo, sendTo])

  function cancelPhoneChange() {
    setPhoneChangeAuthorizationOpen(false)
    onChangeSendTo(defaultPhoneNumber ?? '')
    onWithdrawalPinChange('')
    setPasscodeError('')
    setPhoneChangeStep(defaultPhoneNumber ? 'idle' : 'edit')
  }

  async function verifyPasscode() {
    if (!/^\d{4}$/.test(withdrawalPin)) {
      setPasscodeError('Enter your 4-digit passcode.')
      return
    }
    setIsVerifyingPasscode(true)
    setPasscodeError('')
    try {
      const response = await fetch('/api/withdrawals/verify-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: withdrawalPin }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(body?.error || 'Unable to verify passcode.')
      }
      setPhoneChangeStep('edit')
      setPhoneChangeAuthorizationOpen(false)
      window.setTimeout(() => phoneInputRef.current?.focus(), 0)
    }
    catch (verifyError) {
      setPasscodeError(verifyError instanceof Error ? verifyError.message : 'Unable to verify passcode.')
    }
    finally {
      setIsVerifyingPasscode(false)
    }
  }

  async function authorizeWithdrawal() {
    if (!/^\d{4}$/.test(withdrawalPin)) {
      setWithdrawalAuthorizationError('Enter your 4-digit passcode.')
      return
    }
    setIsVerifyingPasscode(true)
    setWithdrawalAuthorizationError('')
    try {
      const response = await fetch('/api/withdrawals/verify-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: withdrawalPin }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(body?.error || 'Unable to verify passcode.')
      }
      setWithdrawalAuthorizationOpen(false)
      await onSubmitSend()
    }
    catch (verifyError) {
      setWithdrawalAuthorizationError(verifyError instanceof Error ? verifyError.message : 'Unable to verify passcode.')
    }
    finally {
      setIsVerifyingPasscode(false)
    }
  }

  function requestWithdrawalAuthorization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitDisabled) return
    onWithdrawalPinChange('')
    setWithdrawalAuthorizationError('')
    setWithdrawalAuthorizationOpen(true)
  }

  function confirmPhoneChange() {
    if (!normalizedPhone) {
      setPasscodeError('Enter a valid Kenyan phone number.')
      return
    }
    setPasscodeError('')
    setPhoneChangeStep(normalizedPhone === normalizeKenyanPhone(defaultPhoneNumber ?? '') ? 'idle' : 'changed')
  }

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
    const hasCompleted = settlementStatus === 'completed'
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
        description: hasCompleted ? 'Treasury settled.' : isSubmitted ? 'Settlement in progress.' : 'Pending.',
        status: hasCompleted ? 'complete' : isSubmitted ? 'active' : 'pending',
      },
      {
        title: 'M-Pesa confirmation',
        description: hasCompleted ? 'Sent to your phone.' : 'Pending.',
        status: hasCompleted ? 'complete' : 'pending',
      },
    ] as const

    return (
      <WalletTransactionTimeline
        title={hasFailed ? 'Withdrawal failed' : hasCompleted ? 'Withdrawal complete' : 'Awaiting payout'}
        description={hasFailed ? error : `Withdrawal to ${normalizedPhone ?? 'your phone'}`}
        amount={hasFailed ? undefined : formatMoney(receiveAmountKes)}
        steps={timeline}
        failed={hasFailed}
        onRetry={onRetrySend}
      />
    )
  }

  return (
    <div className="space-y-5">
      <Dialog open={withdrawalAuthorizationOpen} onOpenChange={setWithdrawalAuthorizationOpen}>
        <DialogContent className="max-w-sm border bg-background">
          <DialogHeader className="text-center">
            <DialogTitle>Authorize withdrawal</DialogTitle>
            <DialogDescription>Enter your four-digit passcode before funds can leave your balance.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <PasscodeInput
              value={withdrawalPin}
              onChange={(value) => {
                onWithdrawalPinChange(value)
                setWithdrawalAuthorizationError('')
              }}
              autoFocus
              ariaLabel="Authorize withdrawal with passcode"
            />
            {withdrawalAuthorizationError && (
              <p className="flex animate-order-shake items-center gap-2 text-xs font-semibold text-orange-500">
                <TriangleAlertIcon className="size-3.5 shrink-0" />
                {withdrawalAuthorizationError}
              </p>
            )}
            <Button
              type="button"
              className="h-11 w-full"
              disabled={withdrawalPin.length !== 4 || isVerifyingPasscode}
              onClick={authorizeWithdrawal}
            >
              {isVerifyingPasscode ? 'Verifying...' : 'Continue'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">Forgot your passcode? Contact support.</p>
          </div>
        </DialogContent>
      </Dialog>
      {phoneChangeAuthorizationOpen && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center bg-black/50 p-4"
          data-modal-overlay="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby="withdrawal-number-passcode-title"
        >
          <div className="relative w-full max-w-sm space-y-4 rounded-lg border bg-background p-6 shadow-lg">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 size-9"
              aria-label="Close passcode dialog"
              onClick={cancelPhoneChange}
            >
              <XIcon className="size-4" />
            </Button>
            <div className="space-y-2 pr-8 text-center">
              <h2 id="withdrawal-number-passcode-title" className="text-lg font-semibold">Change withdrawal number</h2>
              <p className="text-sm text-muted-foreground">Enter your four-digit passcode to edit the M-Pesa number.</p>
            </div>
            <PasscodeInput
              value={withdrawalPin}
              onChange={(value) => {
                onWithdrawalPinChange(value)
                setPasscodeError('')
              }}
              autoFocus
              ariaLabel="Authorize withdrawal number change"
            />
            {passcodeError && (
              <p className="flex animate-order-shake items-center gap-2 text-xs font-semibold text-orange-500">
                <TriangleAlertIcon className="size-3.5 shrink-0" />
                {passcodeError}
              </p>
            )}
            <Button
              type="button"
              className="h-11 w-full"
              disabled={withdrawalPin.length !== 4 || isVerifyingPasscode}
              onClick={verifyPasscode}
            >
              {isVerifyingPasscode ? 'Verifying...' : 'Continue'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">Forgot your passcode? Contact support.</p>
          </div>
        </div>
      )}
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

      <form className="mt-2 grid gap-4" onSubmit={requestWithdrawalAuthorization}>
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
              ref={phoneInputRef}
              id="wallet-send-to"
              value={sendTo}
              onChange={event => onChangeSendTo(event.target.value)}
              placeholder="07xx xxx xxx"
              inputMode="tel"
              readOnly={phoneChangeStep !== 'edit'}
              className={cn('h-10 border-0 px-0 text-sm shadow-none placeholder:text-sm focus-visible:ring-0', phoneChangeStep === 'edit' && 'rounded-sm ring-2 ring-primary/40')}
              required
            />
            {(phoneChangeStep === 'idle' || phoneChangeStep === 'changed') && defaultPhoneNumber && (
              <button
                type="button"
                className="ml-2 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  onWithdrawalPinChange('')
                  setPasscodeError('')
                  setPhoneChangeStep('verify')
                  setPhoneChangeAuthorizationOpen(true)
                }}
              >
                Change
              </button>
            )}
            {phoneChangeStep === 'edit' && defaultPhoneNumber && (
              <div className="ml-2 flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Cancel phone number change" onClick={cancelPhoneChange}>
                  <XIcon className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-8 text-primary" aria-label="Confirm phone number change" disabled={!normalizedPhone} onClick={confirmPhoneChange}>
                  <CheckIcon className="size-4" />
                </Button>
              </div>
            )}
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
              className={cn(`
                h-12 [appearance:textfield] pr-36 text-sm
                [&::-webkit-inner-spin-button]:appearance-none
                [&::-webkit-outer-spin-button]:appearance-none
              `)}
              required
            />
            <div className="absolute inset-y-2 right-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">{currency === 'KES' ? 'KES' : 'USD'}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs text-foreground hover:text-muted-foreground"
                onClick={() => onChangeSendAmount(currency === 'KES'
                  ? String(Math.floor(maximumRecipientDisplay))
                  : maximumRecipientDisplay.toFixed(2))}
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
              <span className="text-muted-foreground">{formatMoney(receiveAmountKes)}</span>
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
                          <span className="text-right">{formatMoney(feeAmountKes)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Payment gateway fee</span>
                          <span className="text-right">{formatMoney(withdrawalQuote.providerFee)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Slimefish withdrawal fee</span>
                          <span className="text-right">{formatMoney(withdrawalQuote.platformFee)}</span>
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
                    <span>{formatMoney(feeAmountKes)}</span>
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
                      Slippage occurs due to price changes during trade execution. Minimum received: {formatMoney(receiveAmountKes)}
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
