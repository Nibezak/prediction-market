import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const URL_REGEX = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi
const TRAILING_PUNCTUATION = /[).,!?:;]+$/

function normalizeUrl(value: string) {
  if (/^https?:\/\//i.test(value)) {
    return value
  }
  return `https://${value}`
}

function splitContent(content: string) {
  const parts: ReactNode[] = []
  let lastIndex = 0

  content.replace(URL_REGEX, (match, _url, offset) => {
    if (offset > lastIndex) {
      parts.push(content.slice(lastIndex, offset))
    }

    let url = match
    let trailing = ''
    const trailingMatch = match.match(TRAILING_PUNCTUATION)
    if (trailingMatch) {
      trailing = trailingMatch[0]
      url = match.slice(0, -trailing.length)
    }

    parts.push(
      <a
        key={`${offset}-${match}`}
        href={normalizeUrl(url)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline-offset-2 transition-colors hover:text-primary/80 hover:underline"
      >
        {url}
      </a>,
    )

    if (trailing) {
      parts.push(trailing)
    }

    lastIndex = offset + match.length
    return match
  })

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts
}

function decodeHtmlEntities(str: string): string {
  if (!str) return ''
  const unescapedAmp = str.replace(/&amp;/gi, '&')
  return unescapedAmp
    .replace(/&#x27;/gi, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&#0*34;/g, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

export default function EventCommentContent({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const decodedContent = decodeHtmlEntities(content)
  return (
    <p className={cn('text-sm/5.25 font-normal wrap-break-word', className)}>
      {splitContent(decodedContent)}
    </p>
  )
}
