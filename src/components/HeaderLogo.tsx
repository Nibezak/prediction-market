'use client'

import Link from 'next/link'
import SiteLogoIcon from '@/components/SiteLogoIcon'
import { useSiteIdentity } from '@/hooks/useSiteIdentity'
import { cn } from '@/lib/utils'

interface HeaderLogoProps {
  labelSuffix?: string
}

export default function HeaderLogo({ labelSuffix }: HeaderLogoProps) {
  const site = useSiteIdentity()
  const label = labelSuffix ? `${site.name} ${labelSuffix}` : site.name

  return (
    <Link
      href={'/' as any}
      className={cn(`
        flex h-10 shrink-0 items-center gap-2 text-2xl font-medium text-foreground transition-opacity
        hover:opacity-80
      `)}
    >
      <SiteLogoIcon
        logoSvg={site.logoSvg}
        logoImageUrl={site.logoImageUrl}
        alt={`${site.name} logo`}
        className="
          flex h-11 w-auto items-center text-current
          [&_circle]:fill-current
          [&_path]:fill-current
          [&_rect]:fill-current
          [&_svg]:h-11 [&_svg]:w-auto
        "
        imageClassName="h-11 w-auto object-contain"
        size={44}
      />
      <span>{label}</span>
    </Link>
  )
}
