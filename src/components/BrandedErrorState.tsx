'use client'

import { HomeIcon, RefreshCwIcon, WifiOffIcon } from 'lucide-react'
import AppLink from '@/components/AppLink'
import HeaderLogo from '@/components/HeaderLogo'
import { Button } from '@/components/ui/button'

type BrandedErrorStateProps = {
  code: string
  title: string
  description: string
  retry?: () => void
}

export default function BrandedErrorState({ code, title, description, retry }: BrandedErrorStateProps) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b px-5 py-3 sm:px-8"><HeaderLogo /></header>
      <main className="flex min-h-[calc(100dvh-4.5rem)] items-center justify-center px-5 py-12">
      <section className="grid w-full max-w-xl justify-items-center gap-7 text-center">
        <div className="relative flex h-48 w-48 items-center justify-center" aria-hidden="true">
          <div className="absolute inset-x-4 bottom-2 h-px bg-border" />
          <img src="/images/brand/octopus-slimefish.svg" alt="" className="relative h-44 w-auto object-contain" />
          <span className="absolute right-1 top-4 border bg-background px-2 py-1 font-mono text-xs text-muted-foreground">{code}</span>
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
            <WifiOffIcon className="size-4" />
            Slimefish could not load this page
          </div>
          <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={retry ?? (() => window.location.reload())}><RefreshCwIcon className="size-4" />Try again</Button>
          <Button variant="outline" asChild><AppLink href="/"><HomeIcon className="size-4" />Home</AppLink></Button>
        </div>
      </section>
      </main>
    </div>
  )
}
