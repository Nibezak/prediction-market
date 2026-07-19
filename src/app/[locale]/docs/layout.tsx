import { notFound } from 'next/navigation'
import './docs.css'

export default async function Layout({ params, children }: LayoutProps<'/[locale]/docs'>) {
  notFound()
}
