'use client'

import type { DepositWalletStatus } from '@/types'
import type { WalletOnrampProgress } from '@/app/[locale]/(platform)/_components/wallet-modal/WalletOnrampForm'
import { useExtracted } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { WalletDepositModal, WalletWithdrawModal } from '@/app/[locale]/(platform)/_components/WalletModal'
import { useBalance } from '@/hooks/useBalance'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useSiteIdentity } from '@/hooks/useSiteIdentity'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import { MAX_AMOUNT_INPUT } from '@/lib/amount-input'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { formatAmountInputValue } from '@/lib/formatters'
import { normalizeKenyanPhone } from '@/lib/kenyan-phone'

type DepositView = 'fund' | 'receive'

interface WalletFlowProps {
  depositOpen: boolean
  onDepositOpenChange: (open: boolean) => void
  withdrawOpen: boolean
  onWithdrawOpenChange: (open: boolean) => void
  user: {
    id: string
    address: string
    deposit_wallet_address?: string | null
    deposit_wallet_status?: DepositWalletStatus | null
  } | null
  meldUrl: string | null
  defaultPhoneNumber?: string
}

interface WalletSendMessages {
  depositWalletRequired: string
  invalidRecipient: string
  invalidAmount: string
  reconnectWallet: string
  withdrawalSubmitted: string
  withdrawalSubmittedDescription: string
}

function useDepositViewState(onDepositOpenChange: (open: boolean) => void) {
  const [depositView, setDepositView] = useState<DepositView>('fund')

  const handleDepositModalChange = useCallback((next: boolean) => {
    onDepositOpenChange(next)
    if (!next) {
      setDepositView('fund')
    }
  }, [onDepositOpenChange])

  return { depositView, setDepositView, handleDepositModalChange }
}

function useWithdrawFormState(onWithdrawOpenChange: (open: boolean) => void, defaultPhoneNumber: string) {
  const [walletSendTo, setWalletSendTo] = useState('')
  const [walletSendAmount, setWalletSendAmount] = useState('')
  const [isWalletSending, setIsWalletSending] = useState(false)
  const [walletSendSubmitted, setWalletSendSubmitted] = useState(false)
  const [walletSendIntentId, setWalletSendIntentId] = useState<string | null>(null)
  const [walletSendSettlementStatus, setWalletSendSettlementStatus] = useState<'pending' | 'completed' | 'failed'>('pending')
  const [walletSendError, setWalletSendError] = useState('')
  const [withdrawalPin, setWithdrawalPin] = useState('')

  useEffect(() => {
    if (defaultPhoneNumber) {
      setWalletSendTo(current => current || defaultPhoneNumber)
    }
  }, [defaultPhoneNumber])

  const handleWithdrawModalChange = useCallback((next: boolean) => {
    onWithdrawOpenChange(next)
    if (next) {
      setWalletSendTo(defaultPhoneNumber)
      setWithdrawalPin('')
    }
  }, [defaultPhoneNumber, onWithdrawOpenChange])

  return {
    walletSendTo,
    setWalletSendTo,
    walletSendAmount,
    setWalletSendAmount,
    isWalletSending,
    setIsWalletSending,
    walletSendSubmitted,
    setWalletSendSubmitted,
    walletSendIntentId,
    setWalletSendIntentId,
    walletSendSettlementStatus,
    setWalletSendSettlementStatus,
    walletSendError,
    setWalletSendError,
    withdrawalPin,
    setWithdrawalPin,
    handleWithdrawModalChange,
  }
}

function useHasDeployedDepositWallet(user: WalletFlowProps['user']) {
  return useMemo(() => (
    Boolean(user?.deposit_wallet_address && user?.deposit_wallet_status === 'deployed')
  ), [user?.deposit_wallet_address, user?.deposit_wallet_status])
}

function useWalletSendHandler({
  walletSendTo,
  walletSendAmount,
  setIsWalletSending,
  setWalletSendSubmitted,
  setWalletSendError,
  setWalletSendIntentId,
  setWalletSendSettlementStatus,
  messages,
  withdrawalPin,
  amountCurrency,
  kesPerUsdc,
}: {
  walletSendTo: string
  walletSendAmount: string
  setIsWalletSending: (value: boolean) => void
  setWalletSendSubmitted: (value: boolean) => void
  setWalletSendError: (value: string) => void
  setWalletSendIntentId: (value: string | null) => void
  setWalletSendSettlementStatus: (value: 'pending' | 'completed' | 'failed') => void
  messages: WalletSendMessages
  withdrawalPin: string
  amountCurrency: 'KES' | 'USDC'
  kesPerUsdc: number
}) {
  return useCallback(async () => {
    const normalizedPhone = normalizeKenyanPhone(walletSendTo)
    if (!normalizedPhone) {
      toast.error(messages.invalidRecipient)
      return
    }
    const amountNumber = Number(walletSendAmount)
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      toast.error(messages.invalidAmount)
      return
    }

    setIsWalletSending(true)
    setWalletSendError('')
    setWalletSendSubmitted(false)
    setWalletSendSettlementStatus('pending')
    try {
      const response = await fetch('/api/withdrawals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountKes: amountCurrency === 'KES' ? Math.floor(amountNumber) : Math.floor(amountNumber * kesPerUsdc),
          destination: normalizedPhone,
          withdrawalPin,
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || DEFAULT_ERROR_MESSAGE)

      toast.success(messages.withdrawalSubmitted, {
        description: result?.data?.message || messages.withdrawalSubmittedDescription,
      })
      setWalletSendSubmitted(true)
      setWalletSendIntentId(result?.data?.id || null)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE
      setWalletSendError(message)
      toast.error(message)
    }
    finally {
      setIsWalletSending(false)
    }
  }, [
    messages,
    setIsWalletSending,
    setWalletSendError,
    setWalletSendIntentId,
    setWalletSendSettlementStatus,
    setWalletSendSubmitted,
    walletSendAmount,
    walletSendTo,
    withdrawalPin,
    amountCurrency,
    kesPerUsdc,
  ])
}

function useBuyHandler({
  meldUrl,
  handleDepositModalChange,
}: {
  meldUrl: string | null
  handleDepositModalChange: (next: boolean) => void
}) {
  return useCallback((url?: string | null) => {
    const targetUrl = url ?? meldUrl
    if (!targetUrl) {
      return
    }

    const width = 480
    const height = 780
    const popup = window.open(
      targetUrl,
      'meld_onramp',
      `width=${width},height=${height},scrollbars=yes,resizable=yes`,
    )

    if (popup) {
      popup.focus()
      handleDepositModalChange(false)
    }
  }, [handleDepositModalChange, meldUrl])
}

function useUseConnectedWalletHandler({
  connectedWalletAddress,
  setWalletSendTo,
}: {
  connectedWalletAddress: string | null
  setWalletSendTo: (value: string) => void
}) {
  return useCallback(() => {
    if (!connectedWalletAddress) {
      return
    }
    setWalletSendTo(connectedWalletAddress)
  }, [connectedWalletAddress, setWalletSendTo])
}

function useSetMaxAmountHandler({
  balanceRaw,
  setWalletSendAmount,
}: {
  balanceRaw: number
  setWalletSendAmount: (value: string) => void
}) {
  return useCallback(() => {
    const amount = Number.isFinite(balanceRaw) ? balanceRaw : 0
    const limitedAmount = Math.min(amount, MAX_AMOUNT_INPUT)
    setWalletSendAmount(formatAmountInputValue(limitedAmount, { roundingMode: 'floor' }))
  }, [balanceRaw, setWalletSendAmount])
}

export function WalletFlow({
  depositOpen,
  onDepositOpenChange,
  withdrawOpen,
  onWithdrawOpenChange,
  user,
  meldUrl,
  defaultPhoneNumber = '',
}: WalletFlowProps) {
  const isMobile = useIsMobile()
  const t = useExtracted()
  const { depositView, setDepositView, handleDepositModalChange } = useDepositViewState(onDepositOpenChange)
  const [onrampProgress, setOnrampProgress] = useState<WalletOnrampProgress | null>(null)
  const [isRestoringDeposit, setIsRestoringDeposit] = useState(false)
  const [isRestoringWithdrawal, setIsRestoringWithdrawal] = useState(false)
  const {
    walletSendTo,
    setWalletSendTo,
    walletSendAmount,
    setWalletSendAmount,
    isWalletSending,
    setIsWalletSending,
    walletSendSubmitted,
    setWalletSendSubmitted,
    walletSendIntentId,
    setWalletSendIntentId,
    walletSendSettlementStatus,
    setWalletSendSettlementStatus,
    walletSendError,
    setWalletSendError,
    withdrawalPin,
    setWithdrawalPin,
    handleWithdrawModalChange,
  } = useWithdrawFormState(onWithdrawOpenChange, defaultPhoneNumber)
  const hasDeployedDepositWallet = useHasDeployedDepositWallet(user)
  const depositWalletAddress = user?.deposit_wallet_address ?? null
  const { balance, isLoadingBalance } = useBalance({ depositWalletAddress })
  const site = useSiteIdentity()
  const { currency, kesPerUsdc } = useDisplayCurrency()
  const connectedWalletAddress = user?.address ?? null

  useEffect(() => {
    if (!depositOpen || !user?.id) return
    let cancelled = false
    const checkDeposit = async () => {
      try {
        const response = await fetch('/api/deposits/initiate', { cache: 'no-store' })
        const payload = await response.json().catch(() => null)
        if (cancelled || !response.ok) return
        const intent = payload?.data
        if (!intent) {
          setOnrampProgress(null)
          return
        }
        const status = String(intent.status)
        setOnrampProgress({
          status: status === 'SUCCEEDED' ? 'completed' : status === 'FAILED' || status === 'EXPIRED' ? 'failed' : 'pending',
          phoneNumber: String(intent.phoneNumber || defaultPhoneNumber || ''),
          netAmount: Number(intent.netAmount || intent.requestedAmount || 0),
          error: intent.failureMessage || undefined,
          response: {
            depositId: String(intent.id),
            status: status === 'SUCCEEDED' ? 'COMPLETED' : status === 'FAILED' || status === 'EXPIRED' ? 'FAILED' : 'PENDING_STK',
            phoneNumber: String(intent.phoneNumber || defaultPhoneNumber || ''),
            message: status === 'SUCCEEDED' ? 'Deposit completed.' : 'Waiting for payment confirmation.',
            fiatCurrency: 'KES', fiatAmount: String(intent.requestedAmount || 0),
            cryptoCurrency: 'USDC', cryptoAmount: String(intent.netAmount || 0),
            exchangeRate: '1', feeFiat: String(intent.providerFee || 0),
            provider: 'cloud9', settlementChain: 'KES', expiresAt: String(intent.expiresAt || ''),
          },
        })
      }
      catch (error) {
        console.error('Error fetching deposit status:', error)
      }
      finally {
        if (!cancelled) setIsRestoringDeposit(false)
      }
    }

    setIsRestoringDeposit(true)
    void checkDeposit()
    const timer = window.setInterval(() => void checkDeposit(), 2_500)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [defaultPhoneNumber, depositOpen, user?.id])

  useEffect(() => {
    if (!withdrawOpen || !user?.id) return
    let cancelled = false
    setIsRestoringWithdrawal(true)
    void fetch('/api/withdrawals', { cache: 'no-store' })
      .then(async response => ({ response, payload: await response.json().catch(() => null) }))
      .then(({ response, payload }) => {
        if (cancelled || !response.ok) return
        const intent = payload?.data
        if (!intent) {
          setWalletSendSubmitted(false)
          setWalletSendIntentId(null)
          return
        }
        const status = String(intent.status)
        setWalletSendTo(String(intent.phoneNumber || defaultPhoneNumber || ''))
        setWalletSendAmount(String(intent.requestedAmount || ''))
        setWalletSendIntentId(String(intent.id))
        setWalletSendSubmitted(true)
        setWalletSendSettlementStatus(status === 'SUCCEEDED' ? 'completed' : status === 'FAILED' || status === 'EXPIRED' ? 'failed' : 'pending')
        setWalletSendError(intent.failureMessage || '')
      })
      .finally(() => { if (!cancelled) setIsRestoringWithdrawal(false) })
    return () => { cancelled = true }
  }, [defaultPhoneNumber, setWalletSendError, setWalletSendIntentId, setWalletSendSettlementStatus, setWalletSendSubmitted, setWalletSendTo, withdrawOpen, user?.id])

  const walletSendMessages = useMemo<WalletSendMessages>(() => ({
    depositWalletRequired: t('Complete your account setup first.'),
    invalidRecipient: t('Enter your M-Pesa phone number.'),
    invalidAmount: t('Enter a valid amount.'),
    reconnectWallet: t('Your session expired. Sign in and try again.'),
    withdrawalSubmitted: t('Withdrawal submitted'),
    withdrawalSubmittedDescription: t('Your withdrawal request has been recorded.'),
  }), [t])

  const handleWalletSend = useWalletSendHandler({
    walletSendTo,
    walletSendAmount,
    setIsWalletSending,
    setWalletSendSubmitted,
    setWalletSendError,
    setWalletSendIntentId,
    setWalletSendSettlementStatus,
    messages: walletSendMessages,
    withdrawalPin,
    amountCurrency: currency === 'USD' ? 'USDC' : 'KES',
    kesPerUsdc,
  })

  const handleBuy = useBuyHandler({ meldUrl, handleDepositModalChange })
  const handleUseConnectedWallet = useUseConnectedWalletHandler({ connectedWalletAddress, setWalletSendTo })
  const handleSetMaxAmount = useSetMaxAmountHandler({
    balanceRaw: currency === 'KES' ? balance.raw : balance.raw / kesPerUsdc,
    setWalletSendAmount,
  })

  useEffect(() => {
    if (!walletSendIntentId || walletSendSettlementStatus !== 'pending') return
    let cancelled = false
    const check = async () => {
      const response = await fetch(`/api/payments/${encodeURIComponent(walletSendIntentId)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (cancelled || !response.ok || !payload?.data) return
      const status = String(payload.data.status)
      if (status === 'SUCCEEDED') setWalletSendSettlementStatus('completed')
      else if (status === 'FAILED' || status === 'EXPIRED') {
        setWalletSendSettlementStatus('failed')
        setWalletSendError(payload.data.failureMessage || 'The withdrawal was not completed.')
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), 3_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [walletSendIntentId, walletSendSettlementStatus])

  return (
    <>
      <WalletDepositModal
        open={depositOpen}
        onOpenChange={handleDepositModalChange}
        isMobile={isMobile}
        walletAddress={depositWalletAddress}
        siteName={site.name}
        meldUrl={meldUrl}
        hasDeployedDepositWallet={hasDeployedDepositWallet}
        view={depositView}
        onViewChange={setDepositView}
        onBuy={handleBuy}
        depositWalletBalance={balance.raw}
        isDepositWalletBalanceLoading={isLoadingBalance}
        defaultPhoneNumber={defaultPhoneNumber}
        onrampProgress={onrampProgress}
        onOnrampProgressChange={setOnrampProgress}
        isRestoringPayment={isRestoringDeposit}
      />
      <WalletWithdrawModal
        open={withdrawOpen}
        onOpenChange={handleWithdrawModalChange}
        isMobile={isMobile}
        siteName={site.name}
        sendTo={walletSendTo}
        onChangeSendTo={setWalletSendTo}
        sendAmount={walletSendAmount}
        onChangeSendAmount={setWalletSendAmount}
        isSending={isWalletSending}
        isSubmitted={walletSendSubmitted}
        settlementStatus={walletSendSettlementStatus}
        error={walletSendError}
        onRetrySend={() => {
          setWalletSendError('')
          setWalletSendSubmitted(false)
          setWalletSendIntentId(null)
          setWalletSendSettlementStatus('pending')
        }}
        onSubmitSend={handleWalletSend}
        connectedWalletAddress={connectedWalletAddress}
        onUseConnectedWallet={handleUseConnectedWallet}
        availableBalance={balance.raw}
        onMax={handleSetMaxAmount}
        isBalanceLoading={isLoadingBalance}
        defaultPhoneNumber={defaultPhoneNumber}
        withdrawalPin={withdrawalPin}
        onWithdrawalPinChange={setWithdrawalPin}
        isRestoringPayment={isRestoringWithdrawal}
      />
    </>
  )
}
