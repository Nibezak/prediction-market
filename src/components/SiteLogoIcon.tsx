'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { SLIMEFISH_FALLBACK_LOGO_SVG } from '@/lib/slimefish-logo'

interface SiteLogoIconProps {
  logoSvg: string
  logoImageUrl?: string | null
  className?: string
  svgClassName?: string
  imageClassName?: string
  alt?: string
  size?: number
}

export default function SiteLogoIcon({
  logoSvg,
  logoImageUrl,
  className,
  svgClassName,
  imageClassName,
  alt = '',
  size = 24,
}: SiteLogoIconProps) {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [logoImageUrl])

  if (logoImageUrl && !imageFailed) {
    return (
      <span className={className}>
        <img
          src={logoImageUrl}
          alt={alt}
          width={size}
          height={size}
          className={cn('size-full object-contain', imageClassName)}
          onError={() => setImageFailed(true)}
        />
      </span>
    )
  }

  const resolvedLogoSvg = imageFailed
    ? SLIMEFISH_FALLBACK_LOGO_SVG
    : (logoSvg || SLIMEFISH_FALLBACK_LOGO_SVG)

  return (
    <span
      className={cn(className, svgClassName)}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      dangerouslySetInnerHTML={{ __html: resolvedLogoSvg }}
    />
  )
}
