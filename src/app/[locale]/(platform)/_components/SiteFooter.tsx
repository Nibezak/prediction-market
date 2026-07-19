import Link from 'next/link'
import HeaderLogo from '@/components/HeaderLogo'
import { loadRuntimeThemeState } from '@/lib/theme-settings'

export default async function SiteFooter() {
  const { site } = await loadRuntimeThemeState()
  const socialLinks = [
    ['Instagram', site.instagramLink],
    ['X', site.twitterLink],
    ['TikTok', site.tiktokLink],
    ['Facebook', site.facebookLink],
    ['LinkedIn', site.linkedinLink],
    ['YouTube', site.youtubeLink],
    ['Discord', site.discordLink],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))
  return (
    <footer className="mt-auto hidden border-t bg-background lg:block">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-3 items-center gap-8 px-6 py-8">
        <div className="justify-self-start">
          <HeaderLogo />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {socialLinks.map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-foreground">
              {label}
            </a>
          ))}
        </div>

        <nav aria-label="Footer" className="flex items-center justify-self-end gap-5 text-sm text-muted-foreground">
          <Link href="/tos" className="transition-colors hover:text-foreground">Terms of Use</Link>
          <Link href="/settings" className="transition-colors hover:text-foreground">Settings</Link>
        </nav>
      </div>
    </footer>
  )
}
