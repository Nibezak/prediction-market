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
      <main className="min-h-[calc(100vh-4.25rem)] bg-background">
        <div className="grid min-w-0 lg:grid-cols-[240px_1fr]">
          <AdminSidebar />
          <div className="flex min-w-0 flex-col px-4 py-6 md:px-8 lg:px-12 bg-muted/10 min-h-[calc(100vh-4.25rem)]">
            <div className="w-full space-y-8 flex-1">
              <AdminBreadcrumb />
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                {children}
              </div>
            </div>
            <div className="mt-8">
              <CopyVersion forkRepositoryUrl={forkRepositoryUrl} />
            </div>
          </div>
        </div>
      </main>
    </AppKitProvider>
  )
}
