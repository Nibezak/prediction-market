import { useExtracted } from 'next-intl'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface TestModeBannerProps {
  persistKey?: string
}

function useTestModeBannerClosedState(persistKey: string) {
  const [closed, setClosed] = useState(() => {
    try {
      return sessionStorage.getItem(persistKey) === '1'
    }
    catch {
      return false
    }
  })

  function closeBanner() {
    setClosed(true)
    try {
      sessionStorage.setItem(persistKey, '1')
    }
    catch {}
  }

  return { closeBanner, closed }
}

export default function TestModeBanner({
  persistKey = 'test_mode_banner_closed_session',
}: TestModeBannerProps) {
  const { closeBanner, closed } = useTestModeBannerClosedState(persistKey)

  const whatsappUrl = process.env.NEXT_PUBLIC_WHATSAPP_GROUP_URL || 'https://chat.whatsapp.com/'
  const t = useExtracted()

  if (closed) {
    return null
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-60">
      <div className="container flex justify-end">
        <div className="pointer-events-auto relative max-w-68 rounded-xl border bg-background text-foreground shadow-xl">
          <button
            type="button"
            onClick={closeBanner}
            className={cn(`
              absolute -top-2 -right-2 inline-flex size-7 items-center justify-center rounded-full border bg-background
              text-sm text-foreground/80 shadow-md transition-colors
              hover:text-foreground
            `)}
            aria-label="Dismiss banner"
          >
            &times;
          </button>
          <div className="py-3 pr-3 pl-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm/relaxed">
                {t('Join our whatsapp group so you don\'t miss out on the latest updates')}
              </p>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(`
                  inline-flex w-fit items-center gap-2 rounded-md bg-[#25D366] px-3 py-1.5 text-xs font-semibold
                  text-white transition
                  hover:bg-[#20ba5a]
                `)}
              >
                <svg
                  className="size-3.5 shrink-0 fill-current"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.517 2.266 2.27 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.002-3.973-.505-5.724-1.46L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.97C16.579 1.967 14.11 .94 11.999.94c-5.444 0-9.866 4.372-9.87 9.802 0 1.814.48 3.59 1.39 5.169l-1.011 3.69 3.79-.979zm11.233-5.632c-.3-.149-1.772-.864-2.046-.962-.273-.099-.473-.149-.673.15-.199.299-.773.962-.948 1.162-.175.199-.349.224-.649.075-.3-.149-1.266-.46-2.41-1.466-.89-.783-1.49-1.75-1.665-2.05-.175-.299-.018-.46.131-.609.135-.134.3-.349.449-.523.149-.174.199-.299.299-.497.099-.199.05-.373-.025-.523-.075-.149-.673-1.62-.922-2.218-.242-.578-.487-.5-.673-.51l-.574-.012c-.199 0-.523.074-.798.373-.274.299-1.047 1.021-1.047 2.49 0 1.47 1.072 2.888 1.222 3.087.149.199 2.11 3.18 5.112 4.466.714.306 1.272.489 1.706.625.717.227 1.37.195 1.887.118.577-.087 1.772-.714 2.022-1.406.249-.693.249-1.284.174-1.407-.075-.124-.274-.199-.574-.349z" />
                </svg>
                {t('Open WhatsApp')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
