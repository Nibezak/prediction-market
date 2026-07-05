'use cache'

import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import PlatformViewerState from '@/app/[locale]/(platform)/_components/PlatformViewerState'
import AdminBreadcrumb from '@/app/[locale]/admin/_components/AdminBreadcrumb'
import AdminHeader from '@/app/[locale]/admin/_components/AdminHeader'
import AdminSidebar from '@/app/[locale]/admin/_components/AdminSidebar'
import CopyVersion from '@/app/[locale]/admin/_components/CopyVersion'
import AppKitProvider from '@/providers/AppKitProvider'

export const metadata: Metadata = {
  title: 'Admin',
}

function getForkRepositoryUrl() {
  const repoOwner = process.env.VERCEL_GIT_REPO_OWNER?.trim()
  const repoSlug = process.env.VERCEL_GIT_REPO_SLUG?.trim()

  if (!process.env.VERCEL_ENV || !repoOwner || !repoSlug) {
    return null
  }

  return `https://github.com/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoSlug)}`
}

export default async function AdminLayout({ params, children }: LayoutProps<'/[locale]/admin'>) {
  const { locale } = await params
  setRequestLocale(locale)
  const forkRepositoryUrl = getForkRepositoryUrl()

  return (
    <AppKitProvider>
      <PlatformViewerState />
      <AdminHeader />
      <main className="min-h-[calc(100vh-4rem)] bg-muted/30">
        <div className="grid lg:grid-cols-[240px_1fr]">
          <AdminSidebar />
          <div className="flex min-w-0 flex-col px-4 py-8 md:px-8 lg:px-12">
            <div className="mx-auto w-full max-w-7xl space-y-8">
              <AdminBreadcrumb />
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                {children}
              </div>
            </div>
          </div>
        </div>
        <CopyVersion forkRepositoryUrl={forkRepositoryUrl} />
      </main>
    </AppKitProvider>
  )
}
