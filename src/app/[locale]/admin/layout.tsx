'use cache'

import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import PlatformViewerState from '@/app/[locale]/(platform)/_components/PlatformViewerState'
import AdminBreadcrumb from '@/app/[locale]/admin/_components/AdminBreadcrumb'
import AdminHeader from '@/app/[locale]/admin/_components/AdminHeader'
import AdminSidebar from '@/app/[locale]/admin/_components/AdminSidebar'
import ResponsiveAdminLayout from '@/app/[locale]/admin/_components/ResponsiveAdminLayout'
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
      <ResponsiveAdminLayout sidebar={<AdminSidebar />}>
        <AdminBreadcrumb />
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 flex-1">
          {children}
        </div>
        <CopyVersion forkRepositoryUrl={forkRepositoryUrl} />
      </ResponsiveAdminLayout>
    </AppKitProvider>
  )
}
