'use client'

import type { ComponentProps, FormEvent } from 'react'
import type { TellwiseRampInitiateResponse, TellwiseRampQuoteResponse } from '@/lib/tellwise-service-contracts'
import { Loader2Icon, SmartphoneIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
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
import { useIsMobile } from '@/hooks/useIsMobile'

const MIN_DEPOSIT_KES = 150

interface MpesaModalProps {
  open: boolean
  onOpenChange: ComponentProps<typeof Dialog>['onOpenChange']
  walletAddress?: string | null
}

function sanitizeKesAmount(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '')
  const parts = cleaned.split('.')
  const whole = parts[0] ?? ''
  const cents = parts.slice(1).join('').slice(0, 2)
  return cents.length > 0 ? `${whole}.${cents}` : whole
}

function formatKes(value: string) {
  const amount = Number.parseFloat(value)
  if (!Number.isFinite(amount)) {
    return 'KES 0.00'
  }
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 2,
  }).format(amount)
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message
  }
  return fallback
}

export function MpesaModal({ open, onOpenChange, walletAddress }: MpesaModalProps) {
  const t = useExtracted()
  const isMobile = useIsMobile()
  const [fiatAmount, setFiatAmount] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [quote, setQuote] = useState<TellwiseRampQuoteResponse | null>(null)
  const [deposit, setDeposit] = useState<TellwiseRampInitiateResponse | null>(null)
  const [isQuoting, setIsQuoting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const numericAmount = useMemo(() => Number.parseFloat(fiatAmount), [fiatAmount])
  const canSubmit = Number.isFinite(numericAmount) && numericAmount >= MIN_DEPOSIT_KES && phoneNumber.trim().length >= 10 && !isSubmitting

  useEffect(() => {
    setDeposit(null)
    setError('')

    if (!Number.isFinite(numericAmount) || numericAmount < MIN_DEPOSIT_KES) {
      setQuote(null)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setIsQuoting(true)
      try {
        const response = await fetch('/api/deposits/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fiatAmount }),
          signal: controller.signal,
        })
        const body = await response.json()
        if (!response.ok) {
          throw new Error(body?.error || 'Unable to quote deposit.')
        }
        setQuote(body as TellwiseRampQuoteResponse)
      }
      catch (quoteError) {
        if (!controller.signal.aborted) {
          setQuote(null)
          setError(getErrorMessage(quoteError, 'Unable to quote deposit.'))
        }
      }
      finally {
        if (!controller.signal.aborted) {
          setIsQuoting(false)
        }
      }
    }, 300)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [fiatAmount, numericAmount])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) {
      setError('Enter a valid phone number and at least KES 150.')
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
          phoneNumber,
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

  const content = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <SmartphoneIcon className="size-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">M-Pesa to USDC</p>
          <p className="text-xs text-muted-foreground">Enter KES and phone number to start a mobile money deposit.</p>
        </div>
      </div>

      <div className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Amount</span>
          <div className="flex items-center rounded-md border px-3">
            <span className="text-sm font-semibold text-muted-foreground">KES</span>
            <Input
              value={fiatAmount}
              onChange={event => setFiatAmount(sanitizeKesAmount(event.target.value))}
              inputMode="decimal"
              placeholder="1,000"
              className="h-11 border-0 text-right text-lg font-semibold shadow-none focus-visible:ring-0"
            />
          </div>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Phone number</span>
          <Input
            value={phoneNumber}
            onChange={event => setPhoneNumber(event.target.value)}
            inputMode="tel"
            placeholder="07xx xxx xxx"
            className="h-11"
          />
        </label>

        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">You pay</span>
            <span className="font-medium">{formatKes(fiatAmount)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Estimated USDC</span>
            <span className="font-medium">
              {isQuoting ? '...' : quote ? `${quote.cryptoAmount} USDC` : '0.00 USDC'}
            </span>
          </div>
          {quote && (
            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                Fee
                {' '}
                {formatKes(quote.feeFiat)}
              </span>
              <span className="capitalize">{quote.settlementChain}</span>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        {deposit && (
          <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
            {deposit.message}
          </p>
        )}

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
              {t('M-Pesa to USDC')}
            </DrawerTitle>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border bg-background p-6">
        <DialogHeader className="space-y-2 text-center">
          <DialogTitle className="text-center text-xl font-bold">
            {t('M-Pesa to USDC')}
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  )
}
