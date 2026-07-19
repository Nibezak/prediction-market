'use client'

import type { ImageProps } from 'next/image'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export function isEventMarketIconUrl(url: string | null | undefined) {
  const normalizedUrl = url?.trim() ?? ''
  return normalizedUrl.includes('/events/icons/') || normalizedUrl.includes('/markets/icons/')
}

interface EventIconImageProps extends Omit<ImageProps, 'className' | 'fill' | 'height' | 'width'> {
  containerClassName?: string
  imageClassName?: string
}

export default function EventIconImage({
  src,
  sizes = '100vw',
  containerClassName,
  imageClassName,
  ...props
}: EventIconImageProps) {
  const normalizedSrc = typeof src === 'string' ? src.trim() : src
  const [failed, setFailed] = useState(!normalizedSrc)

  useEffect(() => {
    setFailed(!normalizedSrc)
  }, [normalizedSrc])

  if (failed || !normalizedSrc) {
    return null
  }

  return (
    <div className={cn('relative overflow-hidden', containerClassName)}>
      <Image
        {...props}
        src={normalizedSrc}
        alt=""
        fill
        sizes={sizes}
        onError={() => setFailed(true)}
        className={cn('shrink-0 object-cover object-center', imageClassName)}
      />
    </div>
  )
}
