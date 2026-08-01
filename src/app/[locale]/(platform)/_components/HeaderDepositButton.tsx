'use client'

import { BadgePlusIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

const HeaderDepositFlow = dynamic(
  () => import('@/app/[locale]/(platform)/_components/HeaderDepositFlow'),
  { ssr: false },
)

function useDepositRequestTrigger() {
  const [requestId, setRequestId] = useState(0)

  function handleClick() {
    setRequestId(prev => prev + 1)
  }

  return { requestId, handleClick }
}

export default function HeaderDepositButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const t = useExtracted()
  const { requestId, handleClick } = useDepositRequestTrigger()

  return (
    <>
      <Button
        size={iconOnly ? 'icon' : 'headerCompact'}
        variant={iconOnly ? 'ghost' : 'default'}
        onClick={handleClick}
        aria-label={t('Deposit')}
        title={t('Deposit')}
      >
        {iconOnly ? <BadgePlusIcon className="size-5" strokeWidth={2.25} /> : t('Deposit')}
      </Button>
      {requestId > 0 && <HeaderDepositFlow requestId={requestId} />}
    </>
  )
}
