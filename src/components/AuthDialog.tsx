'use client'

import type { FormEvent } from 'react'
import { ArrowLeftIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialMode?: 'sign-in' | 'sign-up'
  onAuthenticated: () => Promise<void> | void
}

export function AuthDialog({ open, onOpenChange, initialMode = 'sign-in', onAuthenticated }: AuthDialogProps) {
  const [mode, setMode] = useState(initialMode)
  const [step, setStep] = useState<'email' | 'password'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function reset(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setStep('email')
      setPassword('')
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (step === 'email') {
      setStep('password')
      return
    }

    setIsSubmitting(true)
    try {
      const result = mode === 'sign-up'
        ? await authClient.signUp.email({ email, password, name: email })
        : await authClient.signIn.email({ email, password })

      if (result.error) {
        toast.error(result.error.message || 'Authentication failed.')
        return
      }

      await onAuthenticated()
      reset(false)
      toast.success(mode === 'sign-up' ? 'Your account is ready.' : 'Welcome back.')
    }
    catch {
      toast.error('Authentication failed. Please try again.')
    }
    finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle>{mode === 'sign-up' ? 'Create your account' : 'Welcome back'}</DialogTitle>
          <DialogDescription>
            {step === 'email' ? 'Continue with your email address.' : `Enter the password for ${email}.`}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={submit}>
          {step === 'email'
            ? (
                <Input
                  autoFocus
                  required
                  type="email"
                  autoComplete="email"
                  placeholder="Email address"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                />
              )
            : (
                <div className="space-y-3">
                  <Button type="button" variant="ghost" size="sm" className="px-0" onClick={() => setStep('email')}>
                    <ArrowLeftIcon />
                    Change email
                  </Button>
                  <Input
                    autoFocus
                    required
                    minLength={8}
                    type="password"
                    autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                    placeholder="Password"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                  />
                </div>
              )}

          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait...' : 'Continue'}
          </Button>
        </form>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button type="button" variant="outline" className="w-full" disabled title="Google sign-in is coming soon">
          <span className="font-semibold">G</span>
          Continue with Google
        </Button>

        <Button
          type="button"
          variant="link"
          className="w-full"
          onClick={() => {
            setMode(current => current === 'sign-in' ? 'sign-up' : 'sign-in')
            setStep('email')
            setPassword('')
          }}
        >
          {mode === 'sign-in' ? 'New to Slimefish? Sign up' : 'Already have an account? Log in'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
