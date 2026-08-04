import { AMOY_CHAIN_ID, parseNetworkChainId } from '@/lib/network'

export interface PublicRuntimeConfig {
  clobUrl: string
  commitSha: string
  communityUrl: string
  createMarketUrl: string
  dataUrl: string
  gammaUrl: string
  geoblockUrl: string
  isVercel: string
  chainId: number
  polygonRpcUrl: string
  priceReferenceUrl: string
  relayerUrl: string
  reownAppKitProjectId: string
  sdkDownloadUrl: string
  sentryDsn: string
  siteUrl: string
  userPnlUrl: string
  wsClobUrl: string
  wsLiveDataUrl: string
}

export const defaultPublicRuntimeConfig: PublicRuntimeConfig = {
  clobUrl: '',
  commitSha: 'unknown',
  communityUrl: '',
  createMarketUrl: '',
  dataUrl: '',
  gammaUrl: '',
  geoblockUrl: '',
  isVercel: 'false',
  chainId: AMOY_CHAIN_ID,
  polygonRpcUrl: '',
  priceReferenceUrl: '',
  relayerUrl: '',
  reownAppKitProjectId: '',
  sdkDownloadUrl: '',
  sentryDsn: '',
  siteUrl: 'http://localhost:3000',
  userPnlUrl: '',
  wsClobUrl: '',
  wsLiveDataUrl: '',
}

export function normalizePublicRuntimeEnvValue(value: string | undefined, fallback = '') {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : fallback
}

export function resolvePublicRuntimeEnv(env: NodeJS.ProcessEnv): Omit<PublicRuntimeConfig, 'commitSha' | 'siteUrl'> {
  const siteUrl = env.SITE_URL || 'http://localhost:3000'

  return {
    clobUrl: normalizePublicRuntimeEnvValue(env.TELLWISE_CLOB_URL, normalizePublicRuntimeEnvValue(env.CLOB_URL, '/api/amm')),
    communityUrl: normalizePublicRuntimeEnvValue(
      env.NEXT_PUBLIC_COMMUNITY_URL,
      normalizePublicRuntimeEnvValue(env.TELLWISE_COMMUNITY_URL, normalizePublicRuntimeEnvValue(env.COMMUNITY_URL, '/api/community')),
    ),
    createMarketUrl: normalizePublicRuntimeEnvValue(env.TELLWISE_CREATE_MARKET_URL, normalizePublicRuntimeEnvValue(env.CREATE_MARKET_URL, defaultPublicRuntimeConfig.createMarketUrl)),
    dataUrl: normalizePublicRuntimeEnvValue(env.TELLWISE_DATA_URL, normalizePublicRuntimeEnvValue(env.DATA_URL, defaultPublicRuntimeConfig.dataUrl)),
    gammaUrl: normalizePublicRuntimeEnvValue(env.TELLWISE_GAMMA_URL, normalizePublicRuntimeEnvValue(env.GAMMA_URL, defaultPublicRuntimeConfig.gammaUrl)),
    geoblockUrl: normalizePublicRuntimeEnvValue(env.TELLWISE_GEOBLOCK_URL, normalizePublicRuntimeEnvValue(env.GEOBLOCK_URL, defaultPublicRuntimeConfig.geoblockUrl)),
    isVercel: env.VERCEL_ENV ? 'true' : 'false',
    chainId: parseNetworkChainId(env.CHAIN_ID, defaultPublicRuntimeConfig.chainId),
    polygonRpcUrl: normalizePublicRuntimeEnvValue(env.POLYGON_RPC_URL),
    priceReferenceUrl: normalizePublicRuntimeEnvValue(env.TELLWISE_PRICE_REFERENCE_URL, normalizePublicRuntimeEnvValue(env.PRICE_REFERENCE_URL, defaultPublicRuntimeConfig.priceReferenceUrl)),
    relayerUrl: normalizePublicRuntimeEnvValue(env.TELLWISE_RELAYER_URL, normalizePublicRuntimeEnvValue(env.RELAYER_URL, '/api/amm')),
    reownAppKitProjectId: normalizePublicRuntimeEnvValue(env.REOWN_APPKIT_PROJECT_ID),
    sdkDownloadUrl: normalizePublicRuntimeEnvValue(env.TELLWISE_SDK_DOWNLOAD_URL, normalizePublicRuntimeEnvValue(env.SDK_DOWNLOAD_URL, defaultPublicRuntimeConfig.sdkDownloadUrl)),
    sentryDsn: normalizePublicRuntimeEnvValue(env.SENTRY_DSN),
    userPnlUrl: normalizePublicRuntimeEnvValue(env.TELLWISE_USER_PNL_URL, normalizePublicRuntimeEnvValue(env.USER_PNL_URL, defaultPublicRuntimeConfig.userPnlUrl)),
    wsClobUrl: normalizePublicRuntimeEnvValue(env.TELLWISE_WS_CLOB_URL, normalizePublicRuntimeEnvValue(env.WS_CLOB_URL, defaultPublicRuntimeConfig.wsClobUrl)),
    wsLiveDataUrl: normalizePublicRuntimeEnvValue(env.TELLWISE_WS_LIVE_DATA_URL, normalizePublicRuntimeEnvValue(env.WS_LIVE_DATA_URL, defaultPublicRuntimeConfig.wsLiveDataUrl)),
  }
}
