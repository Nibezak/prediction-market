import LeaderboardClient from '@/app/[locale]/(platform)/leaderboard/_components/LeaderboardClient'
import { parseLeaderboardFilters } from '@/app/[locale]/(platform)/leaderboard/_utils/leaderboardFilters'

export default async function LegacyLeaderboardPage({
  params,
}: {
  params: Promise<{ segments?: string[] }>
}) {
  const { segments } = await params

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <LeaderboardClient initialFilters={parseLeaderboardFilters(segments)} />
    </main>
  )
}
