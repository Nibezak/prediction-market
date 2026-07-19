import type { SupportedLocale } from '@/i18n/locales'
import { redirect } from '@/i18n/navigation'

interface AdminDashboardPageProps {
  params: Promise<{ locale: string }>
}

export default async function AdminDashboardPage({ params }: AdminDashboardPageProps) {
  const { locale } = await params
  redirect({
    href: '/admin/dashboard',
    locale: locale as SupportedLocale,
  })
}
