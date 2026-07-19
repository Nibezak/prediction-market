'use client'

import type { FormEvent } from 'react'
import { EyeIcon, EyeOffIcon, Loader2Icon, LockKeyholeIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { InputError } from '@/components/ui/input-error'
import { useIsMobile } from '@/hooks/useIsMobile'

interface AdminVerificationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVerify: (passphrase: string) => void
  isVerifying?: boolean
  error?: string | null
}

export function AdminVerificationDialog({
  open,
  onOpenChange,
  onVerify,
  isVerifying = false,
  error = null,
}: AdminVerificationDialogProps) {
  const isMobile = useIsMobile()
  const [passphrase, setPassphrase] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onVerify(passphrase.trim())
  }

  const content = (
    <>
      <div className="
        mx-auto mb-2 flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary shadow-inner
        ring-1 ring-primary/20
      "
      >
        <LockKeyholeIcon className="size-8" />
      </div>
      <div className="grid gap-6 py-4">
        <div className="grid gap-2">
          <label htmlFor="admin-passphrase" className="mb-2 text-center text-sm font-medium text-muted-foreground">
            This area is restricted. Please enter your admin passphrase to continue.
          </label>
          <div className="relative">
            <Input
              id="admin-passphrase"
              type={showPassword ? 'text' : 'password'}
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              placeholder="Enter passphrase..."
              disabled={isVerifying}
              autoComplete="current-password"
              className="
                h-12 border-primary/20 bg-muted/50 pr-10 text-center text-lg tracking-widest
                focus-visible:ring-primary/50
              "
            />
            <button
              type="button"
              className="
                absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors
                hover:text-foreground
              "
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
            </button>
          </div>
          {error && <InputError message={error} />}
        </div>
      </div>
      <DialogFooter className="sm:justify-center">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={isVerifying}
          className="w-full sm:w-auto"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isVerifying || !passphrase.trim()}
          className="w-full min-w-[120px] sm:w-auto"
        >
          {isVerifying ? <Loader2Icon className="size-4 animate-spin" /> : 'Unlock'}
        </Button>
      </DialogFooter>
    </>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh] w-full bg-background px-4 pt-4 pb-6">
          <form onSubmit={handleSubmit}>
            <DrawerHeader className="mt-4 space-y-2 text-center">
              <DrawerTitle>Secure Access</DrawerTitle>
              <DrawerDescription className="text-center">
                Authentication required for admin features.
              </DrawerDescription>
            </DrawerHeader>
            {content}
          </form>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-primary/20 bg-background/95 backdrop-blur-md sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="text-center">
            <DialogTitle className="text-center text-xl">Secure Access</DialogTitle>
            <DialogDescription className="text-center">
              Authentication required for admin features.
            </DialogDescription>
          </DialogHeader>
          {content}
        </form>
      </DialogContent>
    </Dialog>
  )
}
