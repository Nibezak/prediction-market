import BrandedErrorState from '@/components/BrandedErrorState'

export default function NotFound() {
  return <BrandedErrorState code="404" title="That page is not here" description="The link may be old, incomplete, or the page may have moved." />
}
