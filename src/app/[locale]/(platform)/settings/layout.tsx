import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import SettingsSidebar from '@/app/[locale]/(platform)/settings/_components/SettingsSidebar'
import ResponsiveAdminLayout from '@/app/[locale]/admin/_components/ResponsiveAdminLayout'
import { redirect } from '@/i18n/navigation'
import { UserRepository } from '@/lib/db/queries/user'

export default async function SettingsLayout({ params, children }: LayoutProps<'/[locale]/settings'>) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <ResponsiveAdminLayout
      sidebar={<SettingsSidebar />}
      topOffsetClass="top-[6.75rem] md:top-[7.25rem] lg:top-[7.25rem]"
      heightClass="min-h-[calc(100vh-6.75rem)] md:min-h-[calc(100vh-7.25rem)] lg:h-[calc(100vh-7.25rem)]"
    >
      <Suspense fallback={null}>
        <SettingsAuthCheck locale={locale}>
          {children}
        </SettingsAuthCheck>
      </Suspense>
    </ResponsiveAdminLayout>
  )
}

async function SettingsAuthCheck({ locale, children }: { locale: string, children: React.ReactNode }) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser) {
    redirect({ href: '/', locale: locale as any })
  }

  return <>{children}</>
}
