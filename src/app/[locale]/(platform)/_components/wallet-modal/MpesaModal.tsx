'use client'

import type { ComponentProps, FormEvent } from 'react'
import type { TellwiseRampInitiateResponse } from '@/lib/tellwise-service-contracts'
import { ArrowRightIcon, ChevronRightIcon, InfoIcon, Loader2Icon, WalletIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useMemo, useState } from 'react'
import KenyanFlagIcon from '@/components/KenyanFlagIcon'
import SiteLogoIcon from '@/components/SiteLogoIcon'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useSiteIdentity } from '@/hooks/useSiteIdentity'
import { normalizeKenyanPhone } from '@/lib/kenyan-phone'
import { calculateMinisendFeeKes, calculateNetDepositKes, formatKesAmountInput, formatKesMoney, MAX_MPESA_DEPOSIT_KES, MIN_MPESA_DEPOSIT_KES, sanitizeKesAmountInput } from '@/lib/mpesa-money'
import WalletTransactionTimeline from './WalletTransactionTimeline'

interface MpesaModalProps {
  open: boolean
  onOpenChange: ComponentProps<typeof Dialog>['onOpenChange']
  walletAddress?: string | null
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

export function MpesaModal({ open, onOpenChange, walletAddress }: MpesaModalProps) {
  const t = useExtracted()
  const isMobile = useIsMobile()
  const site = useSiteIdentity()
  const [fiatAmount, setFiatAmount] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [deposit, setDeposit] = useState<TellwiseRampInitiateResponse | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [isEditingPhone, setIsEditingPhone] = useState(true)
  const [isFeeDetailsOpen, setIsFeeDetailsOpen] = useState(false)

  const numericAmount = useMemo(() => Number.parseFloat(fiatAmount), [fiatAmount])
  const normalizedPhone = useMemo(() => normalizeKenyanPhone(phoneNumber), [phoneNumber])
  const feeAmount = useMemo(() => calculateMinisendFeeKes(numericAmount), [numericAmount])
  const netDepositAmount = useMemo(() => calculateNetDepositKes(numericAmount), [numericAmount])
  const canSubmit = Number.isFinite(numericAmount)
    && numericAmount >= MIN_MPESA_DEPOSIT_KES
    && numericAmount <= MAX_MPESA_DEPOSIT_KES
    && Boolean(normalizedPhone)
    && !isSubmitting
  const amountValidationMessage = Number.isFinite(numericAmount) && numericAmount > 0 && numericAmount < MIN_MPESA_DEPOSIT_KES
    ? `Minimum deposit is KES ${MIN_MPESA_DEPOSIT_KES.toLocaleString('en-US')}.`
    : Number.isFinite(numericAmount) && numericAmount > MAX_MPESA_DEPOSIT_KES
      ? `Maximum deposit is KES ${MAX_MPESA_DEPOSIT_KES.toLocaleString('en-US')}.`
      : ''

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) {
      setError(`Enter a valid Kenyan phone number and KES ${MIN_MPESA_DEPOSIT_KES.toLocaleString('en-US')} to KES ${MAX_MPESA_DEPOSIT_KES.toLocaleString('en-US')}.`)
      return
    }

    setIsSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/deposits/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fiatAmount,
          phoneNumber: normalizedPhone,
          walletAddress,
        }),
      })
      const body = await response.json()
      if (!response.ok) {
        throw new Error(body?.error || 'Unable to start deposit.')
      }
      setDeposit(body as TellwiseRampInitiateResponse)
    }
    catch (submitError) {
      setDeposit(null)
      setError(getErrorMessage(submitError, 'Unable to start deposit.'))
    }
    finally {
      setIsSubmitting(false)
    }
  }

  function handleTryAgain() {
    setDeposit(null)
    setError('')
  }

  const transactionContent = (isSubmitting || deposit || error)
    ? (
        <WalletTransactionTimeline
          title={error ? 'Deposit could not start' : 'Awaiting transaction'}
          description={error ? error : `Deposit to ${normalizedPhone ?? 'your phone'}`}
          amount={error ? undefined : formatKesMoney(netDepositAmount)}
          steps={[
            {
              title: 'Initiating transaction',
              description: 'Request created.',
              status: error ? 'failed' : 'complete',
            },
            {
              title: 'M-Pesa prompt',
              description: deposit ? 'Sent to your phone.' : error ? 'Prompt failed.' : 'Sending prompt.',
              status: deposit ? 'complete' : error ? 'failed' : 'active',
            },
            {
              title: 'Payment confirmation',
              description: deposit ? 'Waiting for settlement.' : 'Pending.',
              status: deposit ? 'active' : 'pending',
            },
          ]}
          failed={Boolean(error)}
          onRetry={handleTryAgain}
        />
      )
    : null

  const content = (
    <form onSubmit={handleSubmit} className="space-y-4">
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
            <span className="text-sm font-semibold text-muted-foreground">KES</span>
            <Input
              value={formatKesAmountInput(fiatAmount)}
              onChange={event => setFiatAmount(sanitizeKesAmountInput(event.target.value))}
              inputMode="decimal"
              placeholder="1,000"
              className="h-11 border-0 text-right text-lg font-semibold shadow-none focus-visible:ring-0"
            />
          </div>
          {amountValidationMessage && <span className="text-xs text-destructive">{amountValidationMessage}</span>}
        </label>

        <label className="grid gap-1.5">
          <span className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
            <span>Phone number</span>
            {!isEditingPhone && (
              <button
                type="button"
                className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
                onClick={() => setIsEditingPhone(true)}
              >
                Change number
              </button>
            )}
          </span>
          <div className="flex h-11 items-center rounded-md border border-input bg-background px-3 shadow-xs">
            <KenyanFlagIcon className="mr-2 shrink-0" />
            <Input
              value={phoneNumber}
              onChange={event => setPhoneNumber(event.target.value)}
              inputMode="tel"
              placeholder="+254, 07, 254, or 7..."
              readOnly={!isEditingPhone}
              className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </label>

        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Deposit</span>
            <span className="font-medium">{formatKesMoney(netDepositAmount)}</span>
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
                  <span className="font-medium">{formatKesMoney(numericAmount)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        Payment gateway fee
                        <InfoIcon className="size-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>The payment provider charges this fee before funds reach your balance.</TooltipContent>
                  </Tooltip>
                  <span className="font-medium">{formatKesMoney(feeAmount)}</span>
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
                  <span className="font-medium">{formatKesMoney(0)}</span>
                </div>
              </div>
            </TooltipProvider>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button type="submit" className="h-11 w-full" disabled={!canSubmit}>
          {isSubmitting && <Loader2Icon className="mr-2 size-4 animate-spin" />}
          Start deposit
        </Button>
      </div>
    </form>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh] w-full bg-background px-4 pt-4 pb-6">
          <DrawerHeader className="space-y-3 text-center">
            <DrawerTitle className="text-center text-xl font-bold">
              {t('M-Pesa deposit')}
            </DrawerTitle>
          </DrawerHeader>
          {transactionContent ?? content}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border bg-background p-6">
        <DialogHeader className="space-y-2 text-center">
          <DialogTitle className="text-center text-xl font-bold">
            {t('M-Pesa deposit')}
          </DialogTitle>
        </DialogHeader>
        {transactionContent ?? content}
      </DialogContent>
    </Dialog>
  )
}
