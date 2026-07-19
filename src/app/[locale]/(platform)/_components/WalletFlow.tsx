'use client'

import type { DepositWalletStatus } from '@/types'
import { useExtracted } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { WalletDepositModal, WalletWithdrawModal } from '@/app/[locale]/(platform)/_components/WalletModal'
import { useBalance } from '@/hooks/useBalance'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useLiFiWalletUsdBalance } from '@/hooks/useLiFiWalletUsdBalance'
import { useSiteIdentity } from '@/hooks/useSiteIdentity'
import { MAX_AMOUNT_INPUT } from '@/lib/amount-input'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { formatAmountInputValue } from '@/lib/formatters'

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

function useWithdrawFormState(onWithdrawOpenChange: (open: boolean) => void) {
  const [walletSendTo, setWalletSendTo] = useState('')
  const [walletSendAmount, setWalletSendAmount] = useState('')
  const [isWalletSending, setIsWalletSending] = useState(false)

  const handleWithdrawModalChange = useCallback((next: boolean) => {
    onWithdrawOpenChange(next)
    if (!next) {
      setIsWalletSending(false)
      setWalletSendTo('')
      setWalletSendAmount('')
    }
  }, [onWithdrawOpenChange])

  return {
    walletSendTo,
    setWalletSendTo,
    walletSendAmount,
    setWalletSendAmount,
    isWalletSending,
    setIsWalletSending,
    handleWithdrawModalChange,
  }
}

function useHasDeployedDepositWallet(user: WalletFlowProps['user']) {
  return useMemo(() => (
    Boolean(user?.deposit_wallet_address && user?.deposit_wallet_status === 'deployed')
  ), [user?.deposit_wallet_address, user?.deposit_wallet_status])
}

function useWalletSendHandler({
  user,
  walletSendTo,
  walletSendAmount,
  setIsWalletSending,
  setWalletSendTo,
  setWalletSendAmount,
  handleWithdrawModalChange,
  messages,
}: {
  user: WalletFlowProps['user']
  walletSendTo: string
  walletSendAmount: string
  setIsWalletSending: (value: boolean) => void
  setWalletSendTo: (value: string) => void
  setWalletSendAmount: (value: string) => void
  handleWithdrawModalChange: (next: boolean) => void
  messages: WalletSendMessages
}) {
  return useCallback(async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (!walletSendTo.trim()) {
      toast.error(messages.invalidRecipient)
      return
    }
    const amountNumber = Number(walletSendAmount)
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      toast.error(messages.invalidAmount)
      return
    }

    setIsWalletSending(true)
    try {
      const response = await fetch('/api/withdrawals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNumber, destination: walletSendTo.trim(), idempotencyKey: crypto.randomUUID() }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || DEFAULT_ERROR_MESSAGE)

      toast.success(messages.withdrawalSubmitted, {
        description: result?.data?.message || messages.withdrawalSubmittedDescription,
      })
      setWalletSendTo('')
      setWalletSendAmount('')
      handleWithdrawModalChange(false)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE
      toast.error(message)
    }
    finally {
      setIsWalletSending(false)
    }
  }, [
    handleWithdrawModalChange,
    messages,
    setIsWalletSending,
    setWalletSendAmount,
    setWalletSendTo,
    user,
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
}: WalletFlowProps) {
  const isMobile = useIsMobile()
  const t = useExtracted()
  const { depositView, setDepositView, handleDepositModalChange } = useDepositViewState(onDepositOpenChange)
  const {
    walletSendTo,
    setWalletSendTo,
    walletSendAmount,
    setWalletSendAmount,
    isWalletSending,
    setIsWalletSending,
    handleWithdrawModalChange,
  } = useWithdrawFormState(onWithdrawOpenChange)
  const hasDeployedDepositWallet = useHasDeployedDepositWallet(user)
  const depositWalletAddress = user?.deposit_wallet_address ?? null
  const { balance, isLoadingBalance } = useBalance({ depositWalletAddress })
  const {
    formattedUsdBalance: formattedConnectedWalletUsdBalance,
    isLoadingUsdBalance: isLoadingConnectedWalletUsdBalance,
  } = useLiFiWalletUsdBalance(user?.address, { enabled: depositOpen })
  const site = useSiteIdentity()
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
    user,
    walletSendTo,
    walletSendAmount,
    setIsWalletSending,
    setWalletSendTo,
    setWalletSendAmount,
    handleWithdrawModalChange,
    messages: walletSendMessages,
  })

  const handleBuy = useBuyHandler({ meldUrl, handleDepositModalChange })
  const handleUseConnectedWallet = useUseConnectedWalletHandler({ connectedWalletAddress, setWalletSendTo })
  const handleSetMaxAmount = useSetMaxAmountHandler({ balanceRaw: balance.raw, setWalletSendAmount })

  return (
    <>
      <WalletDepositModal
        open={depositOpen}
        onOpenChange={handleDepositModalChange}
        isMobile={isMobile}
        walletAddress={depositWalletAddress}
        walletEoaAddress={user?.address ?? null}
        siteName={site.name}
        meldUrl={meldUrl}
        hasDeployedDepositWallet={hasDeployedDepositWallet}
        view={depositView}
        onViewChange={setDepositView}
        onBuy={handleBuy}
        depositWalletBalance={balance.text}
        isDepositWalletBalanceLoading={isLoadingBalance}
        walletBalance={formattedConnectedWalletUsdBalance}
        isBalanceLoading={isLoadingConnectedWalletUsdBalance}
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
        onSubmitSend={handleWalletSend}
        connectedWalletAddress={connectedWalletAddress}
        onUseConnectedWallet={handleUseConnectedWallet}
        availableBalance={balance.raw}
        onMax={handleSetMaxAmount}
        isBalanceLoading={isLoadingBalance}
      />
    </>
  )
}
