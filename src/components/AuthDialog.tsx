'use client'

import type { FormEvent } from 'react'
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendEmailVerification,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth'
import { ArrowLeftIcon, MailIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
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
import { firebaseAuth } from '@/lib/firebase/client'
import { buildTwoFactorRedirectPath } from '@/lib/locale-path'

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialMode?: 'sign-in' | 'sign-up'
  onAuthenticated: () => Promise<void> | void
}

function firebaseErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : ''

  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Email authentication is not enabled in Firebase Console.'
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists.'
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/weak-password':
      return 'Password must be at least 8 characters.'
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase Authentication.'
    case 'auth/network-request-failed':
      return 'Could not reach server. Check your connection and try again.'
    case 'auth/popup-blocked':
      return 'Your browser blocked Google sign-in. Please try again.'
    case 'auth/web-storage-unsupported':
      return 'This browser is blocking required storage.'
    case 'auth/cancelled-popup-request':
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled.'
    default:
      if (error instanceof Error && error.message) return error.message
      return 'Authentication failed. Please try again.'
  }
}

export function AuthDialog({ open, onOpenChange, initialMode = 'sign-in', onAuthenticated }: AuthDialogProps) {
  const [step, setStep] = useState<'email' | 'password' | 'email-link-sent'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setStep('email')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      if (step === 'password') {
        passwordInputRef.current?.focus()
      }
    }, 80)
    return () => clearTimeout(timer)
  }, [open, step])

  const reset = useCallback((nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setStep('email')
      setPassword('')
    }
  }, [onOpenChange])

  const finishSignIn = useCallback(async (firebaseUser: import('firebase/auth').User) => {
    const response = await fetch('/api/auth/firebase/sign-in', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: await firebaseUser.getIdToken(true) }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.message || 'Authentication failed.')
    }
    if (payload.requiresTwoFactor) {
      window.location.assign(buildTwoFactorRedirectPath(window.location.pathname, window.location.search))
      return false
    }
    await onAuthenticated()
    reset(false)
    return true
  }, [onAuthenticated, reset])

  // Detect Firebase Email Verification / Sign-in Links on page load
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isSignInWithEmailLink(firebaseAuth, window.location.href)) {
      let emailForSignIn = window.localStorage.getItem('emailForSignIn')
      if (!emailForSignIn) {
        emailForSignIn = window.prompt('Please enter your email to confirm sign-in')
      }
      if (emailForSignIn) {
        setIsSubmitting(true)
        signInWithEmailLink(firebaseAuth, emailForSignIn, window.location.href)
          .then(async (credential) => {
            window.localStorage.removeItem('emailForSignIn')
            if (await finishSignIn(credential.user)) {
              toast.success('Email verified! You are now signed in.')
            }
          })
          .catch((err) => {
            console.error('Firebase email link sign-in failed', err)
            toast.error(firebaseErrorMessage(err))
          })
          .finally(() => setIsSubmitting(false))
      }
    }
  }, [finishSignIn])

  useEffect(() => {
    let active = true
    let syncing = false

    async function reconcileFirebaseUser(firebaseUser: import('firebase/auth').User | null) {
      if (!active || !firebaseUser || syncing) {
        return
      }
      syncing = true
      setIsSubmitting(true)
      try {
        const sessionResponse = await fetch('/api/auth/get-session', {
          credentials: 'include',
          cache: 'no-store',
        })
        const sessionPayload = await sessionResponse.json().catch(() => null)
        const sessionEmail = String(sessionPayload?.user?.email ?? '').trim().toLowerCase()
        const firebaseEmail = String(firebaseUser.email ?? '').trim().toLowerCase()

        if (sessionResponse.ok && sessionEmail && sessionEmail === firebaseEmail) {
          await onAuthenticated()
          reset(false)
          return
        }

        if (await finishSignIn(firebaseUser)) {
          toast.success('Welcome back.')
        }
      }
      catch (error) {
        console.error('Firebase account sync failed', error)
        toast.error(error instanceof Error ? error.message : firebaseErrorMessage(error))
      }
      finally {
        syncing = false
        if (active) {
          setIsSubmitting(false)
        }
      }
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      void reconcileFirebaseUser(firebaseUser)
    })

    void getRedirectResult(firebaseAuth)
      .then(credential => reconcileFirebaseUser(credential?.user ?? null))
      .catch((error) => {
        console.error('Firebase Google redirect failed', error)
        toast.error(firebaseErrorMessage(error))
      })

    return () => {
      active = false
      unsubscribe()
    }
  }, [finishSignIn, onAuthenticated, reset])

  async function sendFirebaseMagicLink() {
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address.')
      return
    }
    setIsSubmitting(true)
    try {
      const actionCodeSettings = {
        url: window.location.href,
        handleCodeInApp: true,
      }
      await sendSignInLinkToEmail(firebaseAuth, email, actionCodeSettings)
      window.localStorage.setItem('emailForSignIn', email)
      setStep('email-link-sent')
      toast.success(`Verification link sent to ${email}! Please check your email.`)
    } catch (err: any) {
      console.error('Failed to send Firebase sign-in link', err)
      toast.error(firebaseErrorMessage(err))
    } finally {
      setIsSubmitting(false)
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
      let firebaseUser: import('firebase/auth').User | null = null
      try {
        const credential = await signInWithEmailAndPassword(firebaseAuth, email, password)
        firebaseUser = credential.user
      } catch (signInErr: any) {
        const errCode = signInErr?.code || ''
        if (errCode === 'auth/user-not-found' || errCode === 'auth/invalid-credential' || errCode === 'auth/invalid-email') {
          try {
            const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password)
            firebaseUser = credential.user
            // Send email verification link via Firebase
            if (firebaseUser) {
              await sendEmailVerification(firebaseUser).catch(err => console.warn('Firebase email verification send failed', err))
            }
          } catch (signUpErr: any) {
            const nativeRes = await fetch('/api/auth/sign-up/email', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email, password, name: email.split('@')[0] }),
            })
            const nativeData = await nativeRes.json().catch(() => ({}))
            if (!nativeRes.ok) {
              throw new Error(nativeData?.message || nativeData?.error || firebaseErrorMessage(signUpErr))
            }
            await onAuthenticated()
            reset(false)
            toast.success('Your account is ready.')
            return
          }
        } else {
          const nativeRes = await fetch('/api/auth/sign-in/email', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, password }),
          })
          const nativeData = await nativeRes.json().catch(() => ({}))
          if (!nativeRes.ok) {
            const nativeSignUpRes = await fetch('/api/auth/sign-up/email', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email, password, name: email.split('@')[0] }),
            })
            const nativeSignUpData = await nativeSignUpRes.json().catch(() => ({}))
            if (!nativeSignUpRes.ok) {
              throw new Error(nativeData?.message || nativeSignUpData?.message || firebaseErrorMessage(signInErr))
            }
            await onAuthenticated()
            reset(false)
            toast.success('Your account is ready.')
            return
          }
          await onAuthenticated()
          reset(false)
          toast.success('Welcome back.')
          return
        }
      }

      if (firebaseUser && await finishSignIn(firebaseUser)) {
        toast.success('Welcome back.')
      }
    }
    catch (error: any) {
      toast.error(error instanceof Error ? error.message : firebaseErrorMessage(error))
    }
    finally {
      setIsSubmitting(false)
    }
  }

  async function continueWithGoogle() {
    setIsSubmitting(true)
    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })

      const credential = await signInWithPopup(firebaseAuth, provider)
      if (await finishSignIn(credential.user)) {
        toast.success('Welcome back.')
      }
    }
    catch (error) {
      console.error('Firebase Google sign-in failed', error)
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : ''
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        const provider = new GoogleAuthProvider()
        provider.setCustomParameters({ prompt: 'select_account' })
        await signInWithRedirect(firebaseAuth, provider)
        return
      }
      toast.error(firebaseErrorMessage(error))
    }
    finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle>
            {step === 'email-link-sent' ? 'Check your email' : 'Welcome'}
          </DialogTitle>
          <DialogDescription>
            {step === 'email-link-sent'
              ? `We sent a magic sign-in link to ${email}. Click the link in your email to complete authentication.`
              : step === 'email'
                ? 'Enter your email to sign in or create an account.'
                : `Enter your password for ${email}.`}
          </DialogDescription>
        </DialogHeader>

        {step === 'email-link-sent' ? (
          <div className="space-y-4 text-center py-2">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MailIcon className="size-6" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setStep('email')}
            >
              Back to Sign In
            </Button>
          </div>
        ) : (
          <>
            <form className="space-y-3" onSubmit={submit}>
              {step === 'email'
                ? (
                    <Input
                      ref={emailInputRef}
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
                        ref={passwordInputRef}
                        autoFocus
                        required
                        minLength={8}
                        type="password"
                        autoComplete="current-password"
                        placeholder="Password"
                        value={password}
                        onChange={event => setPassword(event.target.value)}
                      />
                    </div>
                  )}

              <Button className="w-full" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Please wait...' : 'Continue'}
              </Button>

              {step === 'email' && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-xs text-muted-foreground"
                  disabled={isSubmitting}
                  onClick={() => void sendFirebaseMagicLink()}
                >
                  <MailIcon className="mr-1.5 size-3.5" />
                  Email me a magic login link
                </Button>
              )}
            </form>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button type="button" variant="outline" className="w-full" disabled={isSubmitting} onClick={continueWithGoogle}>
              <span className="font-semibold">G</span>
              Continue with Google
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
