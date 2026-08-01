'use client'

import type { DepositWalletStatus } from '@/types'
import type { WalletOnrampProgress } from '@/app/[locale]/(platform)/_components/wallet-modal/WalletOnrampForm'
import { useExtracted } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
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

type DepositView = 'fund' | 'receive' | 'wallets' | 'amount' | 'confirm' | 'success'

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
  const [walletSendError, setWalletSendError] = useState('')

  const handleWithdrawModalChange = useCallback((next: boolean) => {
    onWithdrawOpenChange(next)
    if (next) {
      setWalletSendTo(defaultPhoneNumber)
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
    walletSendError,
    setWalletSendError,
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
  messages,
}: {
  walletSendTo: string
  walletSendAmount: string
  setIsWalletSending: (value: boolean) => void
  setWalletSendSubmitted: (value: boolean) => void
  setWalletSendError: (value: string) => void
  messages: WalletSendMessages
}) {
  return useCallback(async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
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
    try {
      const response = await fetch('/api/withdrawals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNumber, amountCurrency: 'KES', destination: normalizedPhone, idempotencyKey: crypto.randomUUID() }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || DEFAULT_ERROR_MESSAGE)

      toast.success(messages.withdrawalSubmitted, {
        description: result?.data?.message || messages.withdrawalSubmittedDescription,
      })
      setWalletSendSubmitted(true)
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
    setWalletSendSubmitted,
    walletSendAmount,
    walletSendTo,
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
  const {
    walletSendTo,
    setWalletSendTo,
    walletSendAmount,
    setWalletSendAmount,
    isWalletSending,
    setIsWalletSending,
    walletSendSubmitted,
    setWalletSendSubmitted,
    walletSendError,
    setWalletSendError,
    handleWithdrawModalChange,
  } = useWithdrawFormState(onWithdrawOpenChange, defaultPhoneNumber)
  const hasDeployedDepositWallet = useHasDeployedDepositWallet(user)
  const depositWalletAddress = user?.deposit_wallet_address ?? null
  const { balance, isLoadingBalance } = useBalance({ depositWalletAddress })
  const site = useSiteIdentity()
  const { kesPerUsdc } = useDisplayCurrency()
  const connectedWalletAddress = user?.address ?? null

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
    messages: walletSendMessages,
  })

  const handleBuy = useBuyHandler({ meldUrl, handleDepositModalChange })
  const handleUseConnectedWallet = useUseConnectedWalletHandler({ connectedWalletAddress, setWalletSendTo })
  const handleSetMaxAmount = useSetMaxAmountHandler({ balanceRaw: balance.raw * kesPerUsdc, setWalletSendAmount })

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
        depositWalletBalance={balance.text}
        isDepositWalletBalanceLoading={isLoadingBalance}
        defaultPhoneNumber={defaultPhoneNumber}
        onrampProgress={onrampProgress}
        onOnrampProgressChange={setOnrampProgress}
      />
      <WalletWithdrawModal
        open={withdrawOpen}
        onOpenChange={handleWithdrawModalChange}
        isMobile={isMobile}
        siteName={site.name}
        sendTo={walletSendTo}
        onChangeSendTo={event => setWalletSendTo(event.target.value)}
        sendAmount={walletSendAmount}
        onChangeSendAmount={setWalletSendAmount}
        isSending={isWalletSending}
        isSubmitted={walletSendSubmitted}
        error={walletSendError}
        onRetrySend={() => {
          setWalletSendError('')
          setWalletSendSubmitted(false)
        }}
        onSubmitSend={handleWalletSend}
        connectedWalletAddress={connectedWalletAddress}
        onUseConnectedWallet={handleUseConnectedWallet}
        availableBalance={balance.raw * kesPerUsdc}
        onMax={handleSetMaxAmount}
        isBalanceLoading={isLoadingBalance}
        defaultPhoneNumber={defaultPhoneNumber}
      />
    </>
  )
}
