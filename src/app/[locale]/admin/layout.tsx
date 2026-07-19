import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { cookies } from 'next/headers'
import { Suspense } from 'react'
import PlatformViewerState from '@/app/[locale]/(platform)/_components/PlatformViewerState'
import AdminBreadcrumb from '@/app/[locale]/admin/_components/AdminBreadcrumb'
import AdminHeader from '@/app/[locale]/admin/_components/AdminHeader'
import AdminSidebar from '@/app/[locale]/admin/_components/AdminSidebar'
import AdminVerificationWrapper from '@/app/[locale]/admin/_components/AdminVerificationWrapper'
import CopyVersion from '@/app/[locale]/admin/_components/CopyVersion'
import ResponsiveAdminLayout from '@/app/[locale]/admin/_components/ResponsiveAdminLayout'
import { redirect } from '@/i18n/navigation'
import { ADMIN_VERIFICATION_COOKIE_NAME, isAdminEmail, verifyAdminVerificationCookieValue } from '@/lib/admin'
import { UserRepository } from '@/lib/db/queries/user'
import { getUserPlatformRole, isStaffUser } from '@/lib/staff-role'
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
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  const role = getUserPlatformRole(currentUser)

  return (
    <AppKitProvider>
      <AdminAuthCheck locale={locale}>
        <PlatformViewerState />
        <AdminVerifiedContent>
          <AdminHeader />
          <ResponsiveAdminLayout sidebar={<AdminSidebar role={role} />}>
            <AdminBreadcrumb />
            <Suspense fallback={null}>
              <div className="flex-1 animate-in duration-500 fade-in slide-in-from-bottom-2">
                {children}
              </div>
            </Suspense>
            <CopyVersion forkRepositoryUrl={forkRepositoryUrl} />
          </ResponsiveAdminLayout>
        </AdminVerifiedContent>
      </AdminAuthCheck>
    </AppKitProvider>
  )
}

async function AdminAuthCheck({ locale, children }: { locale: string, children: React.ReactNode }) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !isStaffUser(currentUser)) {
    redirect({ href: '/', locale: locale as any })
  }

  return <>{children}</>
}

async function AdminVerifiedContent({ children }: { children: React.ReactNode }) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !isStaffUser(currentUser)) {
    return null
  }

  if (!currentUser.is_admin || !isAdminEmail(currentUser.email)) {
    return <>{children}</>
  }

  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(ADMIN_VERIFICATION_COOKIE_NAME)?.value
  const verified = verifyAdminVerificationCookieValue(cookieValue, currentUser.id)
  if (!verified) {
    return <AdminVerificationWrapper />
  }

  return <>{children}</>
}
