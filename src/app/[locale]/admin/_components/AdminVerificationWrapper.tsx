'use client'

import { useEffect, useState } from 'react'
import { AdminVerificationDialog } from '@/components/AdminVerificationDialog'
import { useUser } from '@/stores/useUser'

interface AdminVerificationWrapperProps {
  children?: React.ReactNode
}

export default function AdminVerificationWrapper({ children }: AdminVerificationWrapperProps) {
  const user = useUser()
  const [isVerified, setIsVerified] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const verifiedUserId = sessionStorage.getItem('tellwise_admin_verified_user_id')
    if (user?.id && verifiedUserId === user.id) {
      setIsVerified(true)
      return
    }
    if (user?.is_admin) {
      setShowDialog(true)
    }
  }, [user?.id, user?.is_admin])

  async function handleVerify(passphrase: string) {
    setIsVerifying(true)
    setError(null)

    const response = await fetch('/api/admin/verify-passphrase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    })

    if (response.ok) {
      if (user?.id) {
        sessionStorage.setItem('tellwise_admin_verified_user_id', user.id)
      }
      setIsVerified(true)
      setShowDialog(false)
      window.location.reload()
    }
    else {
      setError('Invalid passphrase')
    }

    setIsVerifying(false)
  }

  if (!user?.is_admin) {
    return null
  }

  if (isVerified) {
    return <>{children}</>
  }

  return (
    <>
      <AdminVerificationDialog
        open={showDialog || !isVerified}
        onOpenChange={(open) => {
          setShowDialog(open)
        }}
        onVerify={handleVerify}
        isVerifying={isVerifying}
        error={error}
      />
    </>
  )
}
