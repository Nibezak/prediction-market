import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import WalletSendForm from '@/app/[locale]/(platform)/_components/wallet-modal/WalletSendForm'

const mocks = vi.hoisted(() => ({
  useAppKitAccount: vi.fn(),
}))

vi.mock('@reown/appkit/react', () => ({
  useAppKitAccount: () => mocks.useAppKitAccount(),
}))

vi.mock('next/image', () => ({
  default: function MockImage(props: any) {
    return createElement('img', props)
  },
}))

function renderWalletSendForm(overrides: Partial<ComponentProps<typeof WalletSendForm>> = {}) {
  return render(
    <WalletSendForm
      sendTo=""
      onChangeSendTo={vi.fn()}
      sendAmount=""
      onChangeSendAmount={vi.fn()}
      isSending={false}
      onSubmitSend={vi.fn()}
      connectedWalletAddress="0x1234567890123456789012345678901234567890"
      onUseConnectedWallet={vi.fn()}
      availableBalance={100}
      defaultPhoneNumber="0769195528"
      withdrawalPin=""
      onWithdrawalPinChange={vi.fn()}
      {...overrides}
    />,
  )
}

describe('walletSendForm', () => {
  beforeEach(() => {
    mocks.useAppKitAccount.mockReturnValue({
      embeddedWalletInfo: undefined,
    })
  })

  it('uses the saved M-Pesa number instead of exposing a connected-wallet shortcut', () => {
    renderWalletSendForm({ sendTo: '0769195528' })

    expect(screen.getByDisplayValue('0769195528')).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: /use connected/i })).not.toBeInTheDocument()
  })

  it('hides the connected wallet shortcut for embedded wallets without auth provider metadata', () => {
    mocks.useAppKitAccount.mockReturnValue({
      embeddedWalletInfo: {
        user: undefined,
        accountType: undefined,
        isSmartAccountDeployed: false,
      },
    })

    renderWalletSendForm()

    expect(screen.queryByRole('button', { name: /use connected/i })).not.toBeInTheDocument()
  })

  it('requires passcode authorization before submitting a withdrawal', () => {
    const onSubmitSend = vi.fn()
    renderWalletSendForm({ sendTo: '0769195528', sendAmount: '20', onSubmitSend })

    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))

    expect(screen.getByRole('dialog', { name: 'Authorize withdrawal' })).toBeInTheDocument()
    expect(onSubmitSend).not.toHaveBeenCalled()
  })
})
