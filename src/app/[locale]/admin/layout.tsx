import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import PlatformViewerState from '@/app/[locale]/(platform)/_components/PlatformViewerState'
import AdminBreadcrumb from '@/app/[locale]/admin/_components/AdminBreadcrumb'
import AdminHeader from '@/app/[locale]/admin/_components/AdminHeader'
import AdminSidebar from '@/app/[locale]/admin/_components/AdminSidebar'
import ResponsiveAdminLayout from '@/app/[locale]/admin/_components/ResponsiveAdminLayout'
import AppLink from '@/components/AppLink'
import { Button } from '@/components/ui/button'
import { redirect } from '@/i18n/navigation'
import { UserRepository } from '@/lib/db/queries/user'
import { getAdminRiskSignalCount } from '@/lib/db/queries/admin-stats'
import { getUserPlatformRole, isStaffUser } from '@/lib/staff-role'
import { getStaffPermissions } from '@/lib/staff-permissions'
import AppKitProvider from '@/providers/AppKitProvider'

export const metadata: Metadata = {
  title: 'Admin',
}

export default async function AdminLayout({ params, children }: LayoutProps<'/[locale]/admin'>) {
  const { locale } = await params
  setRequestLocale(locale)

  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  const role = getUserPlatformRole(currentUser)
  const riskCount = await getAdminRiskSignalCount().catch(() => 0)

  return (
    <AppKitProvider>
      <AdminAuthCheck locale={locale}>
        <PlatformViewerState />
        <AdminVerifiedContent>
          <AdminHeader />
          <ResponsiveAdminLayout sidebar={<AdminSidebar role={role} permissions={getStaffPermissions(currentUser)} riskCount={riskCount} />}>
            <AdminBreadcrumb />
            <Suspense fallback={null}>
              <div className="flex-1 animate-in duration-500 fade-in slide-in-from-bottom-2">
                {children}
              </div>
            </Suspense>
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

  if (!currentUser.twoFactorEnabled) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Two-factor authentication required</h1>
          <p className="text-sm text-muted-foreground">
            Staff accounts must enable two-factor authentication before accessing admin tools.
          </p>
        </div>
        <Button asChild>
          <AppLink href="/settings/account">Enable two-factor authentication</AppLink>
        </Button>
      </div>
    )
  }

  return <>{children}</>
}
