'use client'

export default function GlobalError({ reset }: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#071a13', color: '#f6faf8', fontFamily: 'Arial, sans-serif' }}>
        <main style={{ alignItems: 'center', display: 'flex', flexDirection: 'column', gap: 24, justifyContent: 'center', minHeight: '100vh', padding: 24, textAlign: 'center' }}>
          <img src="/images/brand/octopus-slimefish.svg" alt="Slimefish" style={{ height: 180, width: 'auto' }} />
          <div><div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>ERROR 500</div><h1 style={{ fontSize: 32, margin: '8px 0' }}>Something did not load</h1><p style={{ color: '#9fb3aa', lineHeight: 1.6, margin: 0 }}>Your account is safe. Try loading Slimefish again.</p></div>
          <button type="button" onClick={reset} style={{ background: '#42dc6b', border: 0, cursor: 'pointer', fontSize: 16, padding: '12px 20px' }}>Try again</button>
        </main>
      </body>
    </html>
  )
}
