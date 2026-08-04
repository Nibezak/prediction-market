import { type NextRequest, NextResponse } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import {
  buildPredictionResultsInternalRoutePath,
  hasPredictionResultsFilterSearchParams,
  PREDICTION_RESULTS_SORT_PARAM,
  PREDICTION_RESULTS_STATUS_PARAM,
  resolvePredictionResultsFiltersFromSearchParams,
} from '@/lib/prediction-results-filters'
import { routing } from './i18n/routing'
import {
  getRequestCountryCode,
  isCountryBlocked,
  loadBlockedCountriesForEnforcement,
} from '@/lib/geoblock-settings'

const intlMiddleware = createMiddleware(routing)
const protectedPrefixes = ['/settings', '/portfolio', '/admin']
type Locale = (typeof routing.locales)[number]

function getLocaleFromPathname(pathname: string): Locale | null {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return locale
    }
  }
  return null
}

function resolveRequestLocale(pathnameLocale: Locale | null): Locale {
  return pathnameLocale ?? routing.defaultLocale
}

function stripLocale(pathname: string, locale: Locale | null) {
  if (!locale) {
    return pathname
  }
  const withoutLocale = pathname.slice(locale.length + 1)
  return withoutLocale.startsWith('/') ? withoutLocale : '/'
}

function withLocale(pathname: string, locale: Locale | null) {
  if (!locale || locale === routing.defaultLocale) {
    return pathname
  }
  return pathname === '/' ? `/${locale}` : `/${locale}${pathname}`
}

function withExplicitLocale(pathname: string, locale: Locale) {
  return pathname === '/' ? `/${locale}` : `/${locale}${pathname}`
}

function resolvePredictionResultsRewrite({
  pathname,
  searchParams,
}: {
  pathname: string
  searchParams: URLSearchParams
}) {
  if (!hasPredictionResultsFilterSearchParams(searchParams)) {
    return null
  }

  if (!/^\/predictions\/[^/]+$/.test(pathname)) {
    return null
  }

  const filters = resolvePredictionResultsFiltersFromSearchParams(searchParams)
  const rewrittenSearchParams = new URLSearchParams(searchParams.toString())

  rewrittenSearchParams.delete(PREDICTION_RESULTS_SORT_PARAM)
  rewrittenSearchParams.delete(PREDICTION_RESULTS_STATUS_PARAM)

  return {
    pathname: buildPredictionResultsInternalRoutePath(pathname, filters),
    search: rewrittenSearchParams.toString(),
  }
}

export default async function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim().split(':')[0]
  const requestHost = request.headers.get('host')?.split(':')[0]
  const effectiveHost = (forwardedHost || requestHost || request.nextUrl.hostname).toLowerCase()

  if (effectiveHost === 'www.slimefish.com') {
    const canonicalUrl = request.nextUrl.clone()
    canonicalUrl.hostname = 'slimefish.com'
    canonicalUrl.port = ''
    canonicalUrl.protocol = 'https:'
    return NextResponse.redirect(canonicalUrl, 308)
  }

  if (request.nextUrl.pathname.startsWith('/__/')) {
    return NextResponse.next()
  }

  const pathnameLocale = getLocaleFromPathname(request.nextUrl.pathname)
  const unlocalizedPath = stripLocale(request.nextUrl.pathname, pathnameLocale)

  if (unlocalizedPath === '/docs/api-reference' || unlocalizedPath.startsWith('/docs/api-reference/')) {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const bypassGeoblock = unlocalizedPath.startsWith('/admin')
    || unlocalizedPath.startsWith('/api/auth')
    || unlocalizedPath.startsWith('/api/geoblock')
    || unlocalizedPath === '/manifest.webmanifest'

  if (!bypassGeoblock) {
    const country = getRequestCountryCode(request.headers)
    if (country) {
      try {
        const blockedCountries = await loadBlockedCountriesForEnforcement()
        if (isCountryBlocked(country, blockedCountries)) {
          return new NextResponse('This service is not available in your country.', {
            status: 451,
            headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
          })
        }
      }
      catch (error) {
        console.error('Geo-blocking check failed', error)
      }
    }
  }

  if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.next()
  if (request.nextUrl.pathname === '/') {
    const localizedHome = request.nextUrl.clone()
    localizedHome.pathname = `/${routing.defaultLocale}`
    return NextResponse.rewrite(localizedHome)
  }

  const predictionResultsRewrite = resolvePredictionResultsRewrite({
    pathname: unlocalizedPath,
    searchParams: request.nextUrl.searchParams,
  })

  if (predictionResultsRewrite) {
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = withExplicitLocale(
      predictionResultsRewrite.pathname,
      resolveRequestLocale(pathnameLocale),
    )
    rewriteUrl.search = predictionResultsRewrite.search

    return NextResponse.rewrite(rewriteUrl)
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: [
    '/((?!trpc|_next|_vercel|.*\\..*).*)',
  ],
}
