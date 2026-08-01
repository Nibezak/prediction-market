'use client'

import type { WalletOnrampProgress } from '@/app/[locale]/(platform)/_components/wallet-modal/WalletOnrampForm'
import { WalletOnrampForm } from '@/app/[locale]/(platform)/_components/wallet-modal/WalletOnrampForm'

function WalletFundMenu({
  walletAddress,
  defaultPhoneNumber,
  onrampProgress,
  onOnrampProgressChange,
}: {
  onBuy: (url: string) => void
  onReceive: () => void
  onWallet: () => void
  disabledBuy: boolean
  disabledReceive: boolean
  meldUrl: string | null
  walletAddress?: string | null
  walletEoaAddress?: string | null
  walletBalance?: string | null
  isBalanceLoading?: boolean
  defaultPhoneNumber?: string
  onrampProgress?: WalletOnrampProgress | null
  onOnrampProgressChange?: (progress: WalletOnrampProgress | null) => void
}) {
  return (
    <div className="grid gap-2">
      <WalletOnrampForm
        walletAddress={walletAddress}
        defaultPhoneNumber={defaultPhoneNumber}
        progress={onrampProgress}
        onProgressChange={onOnrampProgressChange}
      />
    </div>
  )
}

export default WalletFundMenu
