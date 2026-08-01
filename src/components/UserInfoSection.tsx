import Image from 'next/image'
import AppLink from '@/components/AppLink'
import { getAvatarPlaceholderStyle, shouldUseAvatarPlaceholder } from '@/lib/avatar'
import { buildPublicProfilePath, buildUsernameProfilePath } from '@/lib/platform-routing'
import { cn } from '@/lib/utils'
import { useUser } from '@/stores/useUser'

export default function UserInfoSection() {
  const user = useUser()

  if (!user) {
    return null
  }

  const displayUsername = user.username?.length > 12
    ? `${user.username.slice(0, 12)}...`
    : user.username
  const avatarUrl = user.image?.trim() ?? ''
  const avatarSeed = user.deposit_wallet_address || user.address || user.username || 'user'
  const showPlaceholder = shouldUseAvatarPlaceholder(avatarUrl)
  const placeholderStyle = showPlaceholder
    ? getAvatarPlaceholderStyle(avatarSeed)
    : undefined

  const profileHref = buildUsernameProfilePath(user.username || '')
    ?? buildPublicProfilePath(user.deposit_wallet_address || user.address || '')

  return (
    <div className="flex items-center gap-4 p-4">
      <div className="shrink-0">
        {showPlaceholder
          ? (
              <div
                aria-hidden="true"
                className="size-12 rounded-full ring-2 ring-border/20 transition-all duration-200 hover:ring-border/40"
                style={placeholderStyle}
              />
            )
          : (
              <Image
                src={avatarUrl}
                alt="User avatar"
                width={48}
                height={48}
                className={cn(`
                  aspect-square rounded-full object-cover object-center ring-2 ring-border/20 transition-all
                  duration-200
                  hover:ring-border/40
                `)}
              />
            )}
      </div>
      <div className="min-w-0 flex-1">
        {profileHref
          ? (
              <AppLink
                href={profileHref as any}
                className={cn(`
                  truncate text-base/tight font-semibold text-foreground underline-offset-2 transition-colors
                  duration-200
                  hover:underline
                `)}
              >
                {displayUsername}
              </AppLink>
            )
          : (
              <span className="truncate text-base/tight font-semibold text-foreground">
                {displayUsername}
              </span>
            )}

      </div>
    </div>
  )
}
