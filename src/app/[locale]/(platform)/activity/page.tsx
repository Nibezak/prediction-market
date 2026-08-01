import type { SupportedLocale } from '@/i18n/locales'
import { redirect } from '@/i18n/navigation'

export default async function ActivityRedirectPage({ params }: PageProps<'/[locale]/activity'>) {
  const { locale } = await params
  redirect({ href: '/leaderboard', locale: locale as SupportedLocale })
}
