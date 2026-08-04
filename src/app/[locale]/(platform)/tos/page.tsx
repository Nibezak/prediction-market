import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getExtracted, setRequestLocale } from 'next-intl/server'
import { SettingsRepository } from '@/lib/db/queries/settings'
import resolveSiteUrl from '@/lib/site-url'
import { getTermsOfServicePdfUrl } from '@/lib/terms-of-service'
import { getThemeSiteSettingsFormState, loadRuntimeThemeState } from '@/lib/theme-settings'

export async function generateMetadata({ params }: PageProps<'/[locale]/tos'>): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getExtracted()
  const runtimeTheme = await loadRuntimeThemeState()
  return {
    title: t('Terms of Use'),
    description: t(`Terms of Use for {siteName}`, { siteName: runtimeTheme.site.name }),
  }
}

export default async function TermsOfUsePage({ params }: PageProps<'/[locale]/tos'>) {
  const { locale } = await params
  setRequestLocale(locale)

  const { data: allSettings } = await SettingsRepository.getSettings()
  const siteSettings = getThemeSiteSettingsFormState(allSettings ?? undefined)
  const siteName = siteSettings.siteName
  const siteNameUpper = siteName.toUpperCase()
  const siteUrl = resolveSiteUrl(process.env)
  const termsOfServicePdfUrl = getTermsOfServicePdfUrl(allSettings ?? undefined)

  if (termsOfServicePdfUrl) {
    const pdfViewerUrl = termsOfServicePdfUrl.includes('#')
      ? termsOfServicePdfUrl
      : `${termsOfServicePdfUrl}#view=FitH&zoom=page-width&pagemode=none`
    return (
      <main className="h-[calc(100dvh-var(--header-height,0px))] w-full bg-background">
        <iframe className="h-full w-full border-0" src={pdfViewerUrl} title={`${siteName} Terms of Use`} />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-10 px-4 py-10 text-sm leading-7 text-foreground sm:px-6 lg:px-8 lg:py-14">
      <header className="space-y-3 border-b border-border pb-8">
        <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">Terms of Use</h1>
        <p className="text-muted-foreground">Effective 2 August 2026</p>
        <p>
          These Terms govern your use of {siteName} through {siteUrl}. By creating an account, depositing funds,
          placing a trade, or otherwise using the platform, you confirm that you have read and accepted these Terms.
        </p>
      </header>

      <TermsSection title="1. The Slimefish service">
        <p>
          {siteName} operates an event-outcome trading platform. Users may deposit supported fiat currency, hold a
          balance recorded in our internal ledger, buy or sell positions in available markets, receive settlement when
          markets resolve, and request withdrawals through supported payment providers.
        </p>
        <p>
          Market prices represent the trading activity and available liquidity on {siteName}; they are not statements
          of fact, guarantees, investment advice, or promises that an outcome will occur.
        </p>
      </TermsSection>

      <TermsSection title="2. Eligibility and account registration">
        <ul>
          <li>You must be at least 18 years old and legally able to enter a binding agreement.</li>
          <li>You must provide accurate information and complete any identity, age, sanctions, or source-of-funds checks we require.</li>
          <li>You may not use the platform from a jurisdiction we block or where event-outcome trading is unlawful.</li>
          <li>You may maintain only accounts that belong to you and may not sell, transfer, share, or disguise control of an account.</li>
          <li>You must not use a VPN, proxy, false identity, or other method to evade location, eligibility, or account controls.</li>
        </ul>
      </TermsSection>

      <TermsSection title="3. Account and transaction security">
        <p>
          You are responsible for protecting your email account, password, withdrawal passcode, two-factor
          authentication methods, and devices. Staff accounts and other privileged accounts may be required to use
          additional authentication. Tell support immediately if you suspect unauthorized access.
        </p>
        <p>
          We may delay, reject, or review a deposit, withdrawal, trade, refund, or administrative action when required
          to protect users, investigate fraud, comply with law, or reconcile provider and ledger records.
        </p>
      </TermsSection>

      <TermsSection title="4. Balances, deposits, and withdrawals">
        <ul>
          <li>Your displayed balance is based on entries in the {siteName} ledger and may include available, reserved, or unsettled funds.</li>
          <li>A deposit is credited only after the payment provider confirms successful settlement and our reconciliation controls accept it.</li>
          <li>A withdrawal is limited to your available balance after applicable provider costs, limits, reserves, and pending obligations.</li>
          <li>Funds reserved for open trades, pending withdrawals, investigations, chargebacks, or market resolution are not available for withdrawal.</li>
          <li>Provider delays, reversals, duplicate messages, failed payouts, or incorrect recipient details may delay settlement while records are reconciled.</li>
        </ul>
        <p>
          You must review the recipient number and transaction details before confirming. We do not guarantee recovery
          when funds are delivered to a recipient you supplied incorrectly.
        </p>
      </TermsSection>

      <TermsSection title="5. Trading and market resolution">
        <ul>
          <li>Every market is governed by its displayed question, outcomes, closing time, resolution source, and market-specific rules.</li>
          <li>Orders and trades may move prices, incur disclosed fees, or receive partial execution depending on liquidity.</li>
          <li>Open positions can lose some or all of their value. Do not trade money you cannot afford to lose.</li>
          <li>We may pause, cancel, correct, extend, void, or refund a market affected by ambiguity, a data-source failure, manipulation, a manifest error, or an extraordinary event.</li>
          <li>Settlement is final after the applicable review or dispute period, except where correction is required by law or to remedy a material operational error.</li>
        </ul>
      </TermsSection>

      <TermsSection title="6. Insider trading and market abuse">
        <p>
          You must not trade using material non-public information about an event or its resolution. This includes
          confidential information obtained through employment, public office, a sports team, an election campaign, a
          market participant, a resolution source, {siteName}, or any person directly involved in the event.
        </p>
        <p>You must not:</p>
        <ul>
          <li>manipulate or attempt to manipulate a market, price, volume, liquidity, or resolution;</li>
          <li>wash trade, self-trade, spoof, layer orders, coordinate deceptive trades, or create misleading activity;</li>
          <li>use multiple accounts, bots, scripts, stolen identities, or collusion to avoid limits or obtain an unfair advantage;</li>
          <li>bribe, threaten, influence, or impersonate a resolution source, participant, administrator, or other user;</li>
          <li>exploit a software, pricing, settlement, or payment error instead of reporting it promptly.</li>
        </ul>
        <p>
          Suspected abuse may result in cancelled trades, withheld settlement, account restriction, forfeiture of
          improperly obtained gains where permitted by law, permanent removal, and referral to payment providers,
          regulators, or law-enforcement authorities. We may preserve and disclose relevant records where legally allowed.
        </p>
      </TermsSection>

      <TermsSection title="7. Fees, rates, and rounding">
        <p>
          Applicable trading commissions, payment-provider charges, exchange rates, and other costs are shown before
          confirmation or in the relevant market rules. Kenyan-shilling displays use whole shillings and may be rounded
          down as described in the interface. Rates and provider fees may change before a transaction is completed.
        </p>
      </TermsSection>

      <TermsSection title="8. Compliance, investigations, and refunds">
        <p>
          We may monitor transactions and account activity for fraud, sanctions, money laundering, market abuse,
          security threats, and legal compliance. We may request supporting information, restrict trading or
          withdrawals, reverse erroneous internal ledger entries, or refund selected transactions when reasonably
          necessary. Refusing a lawful verification request may result in account restriction or closure.
        </p>
      </TermsSection>

      <TermsSection title="9. Availability and operational risk">
        <p>
          The platform depends on internet, database, hosting, identity, messaging, market-data, and payment services.
          Maintenance, cyberattacks, provider failures, network interruption, or events outside our control may delay or
          prevent access, trading, settlement, deposits, or withdrawals. We will use reasonable controls to restore and
          reconcile service, but uninterrupted availability is not guaranteed.
        </p>
      </TermsSection>

      <TermsSection title="10. Intellectual property and acceptable use">
        <p>
          {siteName}, its software, branding, interfaces, and original content are protected by applicable intellectual
          property laws. We grant you a limited, personal, revocable right to use the platform under these Terms. You
          may not attack, scrape at harmful volume, reverse engineer, resell, copy, interfere with, or obtain
          unauthorized access to the platform or another user's information.
        </p>
      </TermsSection>

      <TermsSection title="11. Suspension and account closure">
        <p>
          We may restrict or close an account for a Terms violation, suspected fraud or abuse, legal or compliance
          requirements, security risk, unpaid obligation, or material threat to the platform. Where lawful and safe,
          legitimate remaining funds will be made available after open obligations and investigations are resolved.
        </p>
      </TermsSection>

      <TermsSection title="12. Disclaimers and liability">
        <p>
          THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE." TO THE MAXIMUM EXTENT PERMITTED BY LAW, {siteNameUpper}
          DISCLAIMS IMPLIED WARRANTIES AND IS NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
          LOSS. NOTHING IN THESE TERMS EXCLUDES LIABILITY THAT CANNOT LAWFULLY BE EXCLUDED, INCLUDING LIABILITY ARISING
          FROM FRAUD, WILFUL MISCONDUCT, OR OTHER NON-EXCLUDABLE OBLIGATIONS.
        </p>
      </TermsSection>

      <TermsSection title="13. Governing law and disputes">
        <p>
          These Terms are governed by the laws of Kenya, without limiting any mandatory consumer rights that apply to
          you. Before filing a claim, contact support and allow 30 days for a good-faith attempt to resolve the matter.
          Unresolved disputes are subject to the courts or lawful dispute-resolution process with jurisdiction in Kenya.
        </p>
      </TermsSection>

      <TermsSection title="14. Changes and contact">
        <p>
          We may update these Terms to reflect product, payment, legal, security, or regulatory changes. Material
          changes will be communicated through the platform or your registered contact details. Continued use after the
          effective date means you accept the revised Terms. Questions and complaints should be submitted through the
          support channel shown in {siteName}.
        </p>
      </TermsSection>
    </main>
  )
}

function TermsSection({ children, title }: { children: ReactNode, title: string }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight lg:text-2xl">{title}</h2>
      <div className="space-y-4 [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:space-y-2">{children}</div>
    </section>
  )
}
