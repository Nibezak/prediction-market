import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import { createMDX } from 'fumadocs-mdx/next'
import createNextIntlPlugin from 'next-intl/plugin'
import { resolveCommitSha } from '@/lib/git'
import { getOptimizedImageHostPatterns } from '@/lib/image/image-optimization'

const optimizedImageHostPatterns = getOptimizedImageHostPatterns(process.env)
const commitSha = resolveCommitSha()

const config: NextConfig = {
  output: process.env.VERCEL_ENV ? undefined : 'standalone',
  cacheComponents: true,
  typedRoutes: true,
  reactStrictMode: false,
  reactCompiler: process.env.NEXT_REACT_COMPILER === 'true',
  productionBrowserSourceMaps: false,
  typescript: {
    ignoreBuildErrors: process.env.NEXT_SKIP_BUILD_TYPECHECK === 'true',
  },
  staticPageGenerationTimeout: 180,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    typedEnv: true,
  },
  images: {
    unoptimized: process.env.DISABLE_IMAGE_OPTIMIZATION === 'true',
    loader: 'custom',
    loaderFile: './src/lib/image/image-loader.ts',
    deviceSizes: [256],
    imageSizes: [16, 20, 24, 32, 36, 40, 42, 44, 48, 56, 64, 96, 128],
    remotePatterns: optimizedImageHostPatterns.map(hostname => ({
      protocol: 'https',
      hostname,
      port: '',
      pathname: '/**',
    })),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }] : []),
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Content-Security-Policy',
            value: 'default-src \'self\'; script-src \'self\'',
          },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/sitemaps/:id.xml',
        destination: '/sitemaps/sitemap/:id.xml',
      },
      {
        source: '/@:username',
        destination: '/profile/:username',
      },
      {
        source: '/:locale/@:username',
        destination: '/:locale/profile/:username',
      },
    ]
  },
  env: {
    COMMIT_SHA: commitSha,
  },
}

const withMDX = createMDX({
  configPath: 'docs.config.ts',
})

const shouldExtractMessages = process.env.NODE_ENV === 'production'
  || process.env.NEXT_INTL_EXTRACT === 'true'

const withNextIntl = createNextIntlPlugin({
  experimental: shouldExtractMessages
    ? {
        extract: true,
        srcPath: './src',
        messages: {
          path: './src/i18n/messages',
          format: 'json',
          locales: 'infer',
          sourceLocale: 'en',
        },
      }
    : undefined,
})

const nextConfig = withNextIntl(withMDX(config))

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      telemetry: false,
      silent: true,
    })
  : nextConfig
