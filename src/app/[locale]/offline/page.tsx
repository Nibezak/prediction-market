import BrandedErrorState from '@/components/BrandedErrorState'

export default function OfflinePage() {
  return <BrandedErrorState code="OFFLINE" title="You are offline" description="Check your connection and try again. Slimefish will reconnect without changing your account or open activity." />
}
