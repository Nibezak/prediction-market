import { redirect } from '@/i18n/navigation'
import type { SupportedLocale } from '@/i18n/locales'

interface AdminDashboardPageProps {
  params: Promise<{ locale: string }>
}

export default async function AdminDashboardPage({ params }: AdminDashboardPageProps) {
  const { locale } = await params
  redirect({
    href: '/admin/settings',
    locale: locale as SupportedLocale,
  })
}
