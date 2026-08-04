'use client'

import type { FormEvent } from 'react'
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
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
import { firebaseAuth, getOrInitAuth, isFirebaseConfigured } from '@/lib/firebase/client'

function getAuthInstance() {
  return getOrInitAuth() || firebaseAuth
}
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
    case 'auth/user-not-found':
      return 'This account does not exist.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'The email or password is incorrect.'
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
      if (error instanceof Error && error.message) {
        return error.message
      }
      return 'Authentication failed. Please try again.'
  }
}

export function AuthDialog({ open, onOpenChange, initialMode = 'sign-in', onAuthenticated }: AuthDialogProps) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>(initialMode)
  const [step, setStep] = useState<'email' | 'password' | 'email-link-sent' | 'verify-email' | 'forgot-password' | 'password-reset-sent'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setMode(initialMode)
      setStep('email')
    }
  }, [initialMode, open])

  useEffect(() => {
    if (!open) {
      return
    }
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
      setConfirmPassword('')
    }
  }, [onOpenChange])

  const finishSignIn = useCallback(async (firebaseUser: import('firebase/auth').User) => {
    if (firebaseUser.providerData.some(provider => provider.providerId === 'password') && !firebaseUser.emailVerified) {
      setEmail(firebaseUser.email || email)
      setStep('verify-email')
      throw new Error('Verify your email before signing in.')
    }
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
  }, [email, onAuthenticated, reset])

  // Detect Firebase Email Verification / Sign-in Links on page load
  useEffect(() => {
    if (typeof window === 'undefined' || !isFirebaseConfigured()) {
      return
    }
    if (isSignInWithEmailLink(getAuthInstance(), window.location.href)) {
      const emailForSignIn = window.localStorage.getItem('emailForSignIn')
      if (!emailForSignIn) {
        setEmail('')
        setStep('email')
        toast.error('Enter the same email address to complete sign-in.')
        return
      }
      if (emailForSignIn) {
        setIsSubmitting(true)
        signInWithEmailLink(getAuthInstance(), emailForSignIn, window.location.href)
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
    if (!isFirebaseConfigured()) {
      return
    }

    let active = true
    let syncing = false

    async function reconcileFirebaseUser(firebaseUser: import('firebase/auth').User | null) {
      if (!active || !firebaseUser || syncing) {
        return
      }
      if (firebaseUser.providerData.some(provider => provider.providerId === 'password') && !firebaseUser.emailVerified) {
        setEmail(firebaseUser.email || '')
        setStep('verify-email')
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

    const unsubscribe = onAuthStateChanged(getAuthInstance(), (firebaseUser) => {
      void reconcileFirebaseUser(firebaseUser)
    })

    void getRedirectResult(getAuthInstance())
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
      await sendSignInLinkToEmail(getAuthInstance(), email, actionCodeSettings)
      window.localStorage.setItem('emailForSignIn', email)
      setStep('email-link-sent')
      toast.success(`Verification link sent to ${email}! Please check your email.`)
    }
    catch (err: any) {
      console.error('Failed to send Firebase sign-in link', err)
      toast.error(firebaseErrorMessage(err))
    }
    finally {
      setIsSubmitting(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (step === 'email') {
      if (typeof window !== 'undefined' && isSignInWithEmailLink(getAuthInstance(), window.location.href)) {
        setIsSubmitting(true)
        try {
          const credential = await signInWithEmailLink(getAuthInstance(), email, window.location.href)
          window.localStorage.removeItem('emailForSignIn')
          if (await finishSignIn(credential.user)) {
            toast.success('Email verified. Welcome to Slimefish.')
          }
        }
        catch (error) {
          toast.error(firebaseErrorMessage(error))
        }
        finally {
          setIsSubmitting(false)
        }
        return
      }
      setStep('password')
      return
    }

    setIsSubmitting(true)
    try {
      if (mode === 'sign-up') {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.')
        }
        const credential = await createUserWithEmailAndPassword(getAuthInstance(), email, password)
        await sendEmailVerification(credential.user, { url: `${window.location.origin}/en` })
        setStep('verify-email')
        toast.success(`Verification link sent to ${email}.`)
      }
      else {
        const credential = await signInWithEmailAndPassword(getAuthInstance(), email, password)
        if (!credential.user.emailVerified) {
          setStep('verify-email')
          throw new Error('Verify your email before signing in.')
        }
        if (await finishSignIn(credential.user)) {
          toast.success('Welcome back.')
        }
      }
    }
    catch (error: any) {
      toast.error(error instanceof Error ? error.message : firebaseErrorMessage(error))
    }
    finally {
      setIsSubmitting(false)
    }
  }

  async function resendVerification() {
    const firebaseUser = getAuthInstance().currentUser
    if (!firebaseUser || firebaseUser.email?.toLowerCase() !== email.trim().toLowerCase()) {
      toast.error('Sign in again to resend the verification email.')
      setStep('password')
      return
    }
    setIsSubmitting(true)
    try {
      await sendEmailVerification(firebaseUser, { url: `${window.location.origin}/en` })
      toast.success(`Verification link sent to ${email}.`)
    }
    catch (error) {
      toast.error(firebaseErrorMessage(error))
    }
    finally {
      setIsSubmitting(false)
    }
  }

  async function confirmEmailVerification() {
    const firebaseUser = getAuthInstance().currentUser
    if (!firebaseUser) {
      setStep('password')
      return
    }
    setIsSubmitting(true)
    try {
      await reload(firebaseUser)
      if (!firebaseUser.emailVerified) {
        throw new Error('Your email is not verified yet. Open the link in your inbox first.')
      }
      if (await finishSignIn(firebaseUser)) {
        toast.success('Email verified. Welcome to Slimefish.')
      }
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : firebaseErrorMessage(error))
    }
    finally {
      setIsSubmitting(false)
    }
  }

  async function requestPasswordReset(event: FormEvent) {
    event.preventDefault()
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address.')
      return
    }
    setIsSubmitting(true)
    try {
      await sendPasswordResetEmail(getAuthInstance(), email, { url: `${window.location.origin}/en` })
      setStep('password-reset-sent')
    }
    catch (error) {
      toast.error(firebaseErrorMessage(error))
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

      const credential = await signInWithPopup(getAuthInstance(), provider)
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
        await signInWithRedirect(getAuthInstance(), provider)
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
            {step === 'email-link-sent' || step === 'verify-email' || step === 'password-reset-sent'
              ? 'Check your email'
              : step === 'forgot-password'
                ? 'Reset your password'
                : mode === 'sign-up'
                  ? 'Create your account'
                  : 'Welcome back'}
          </DialogTitle>
          <DialogDescription>
            {step === 'email-link-sent'
              ? `We sent a magic sign-in link to ${email}. Click the link in your email to complete authentication.`
              : step === 'verify-email'
                ? `We sent a verification link to ${email}. Verify your address before continuing.`
                : step === 'forgot-password'
                  ? 'Enter your account email and we will send password reset instructions.'
                  : step === 'password-reset-sent'
                    ? `If an account exists for ${email}, password reset instructions are on the way.`
                    : step === 'email'
                      ? mode === 'sign-up' ? 'Use your email and a password to get started.' : 'Sign in with your email and password.'
                      : `${mode === 'sign-up' ? 'Create a password for' : 'Enter your password for'} ${email}.`}
          </DialogDescription>
        </DialogHeader>

        {step === 'email-link-sent' || step === 'password-reset-sent'
          ? (
              <div className="space-y-4 py-2 text-center">
                <div className="
                  mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary
                "
                >
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
            )
          : step === 'verify-email'
            ? (
                <div className="space-y-3 py-2">
                  <div className="
                    mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary
                  "
                  >
                    <MailIcon className="size-6" />
                  </div>
                  <Button className="w-full" type="button" disabled={isSubmitting} onClick={() => void confirmEmailVerification()}>
                    {isSubmitting ? 'Checking...' : 'I verified my email'}
                  </Button>
                  <Button className="w-full" type="button" variant="outline" disabled={isSubmitting} onClick={() => void resendVerification()}>
                    Resend verification email
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => setStep('password')}>
                    <ArrowLeftIcon />
                    Back
                  </Button>
                </div>
              )
            : step === 'forgot-password'
              ? (
                  <form className="space-y-3" onSubmit={requestPasswordReset}>
                    <Button type="button" variant="ghost" size="sm" className="px-0" onClick={() => setStep('password')}>
                      <ArrowLeftIcon />
                      Back
                    </Button>
                    <Input
                      autoFocus
                      required
                      type="email"
                      autoComplete="email"
                      placeholder="Email address"
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                    />
                    <Button className="w-full" type="submit" disabled={isSubmitting}>
                      {isSubmitting ? 'Sending...' : 'Send reset link'}
                    </Button>
                  </form>
                )
              : (
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
                                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                                placeholder="Password"
                                value={password}
                                onChange={event => setPassword(event.target.value)}
                              />
                              {mode === 'sign-up' && (
                                <Input
                                  required
                                  minLength={8}
                                  type="password"
                                  autoComplete="new-password"
                                  placeholder="Confirm password"
                                  value={confirmPassword}
                                  onChange={event => setConfirmPassword(event.target.value)}
                                />
                              )}
                              {mode === 'sign-in' && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-auto px-0 text-xs text-muted-foreground"
                                  onClick={() => setStep('forgot-password')}
                                >
                                  Forgot password?
                                </Button>
                              )}
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

                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full text-sm"
                      disabled={isSubmitting}
                      onClick={() => {
                        setMode(current => current === 'sign-in' ? 'sign-up' : 'sign-in')
                        setPassword('')
                        setConfirmPassword('')
                      }}
                    >
                      {mode === 'sign-in' ? 'New to Slimefish? Create account' : 'Already have an account? Sign in'}
                    </Button>

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
