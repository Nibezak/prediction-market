import LeaderboardClient from '@/app/[locale]/(platform)/leaderboard/_components/LeaderboardClient'
import { DEFAULT_FILTERS } from '@/app/[locale]/(platform)/leaderboard/_utils/leaderboardFilters'

export default function LeaderboardPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <LeaderboardClient initialFilters={DEFAULT_FILTERS} />
    </main>
  )
}
