import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, var(--color-accent), transparent)' }}
        />
        <div
          className="absolute bottom-1/4 left-1/4 w-80 h-80 rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, var(--color-preparation), transparent)' }}
        />
        <div
          className="absolute top-1/2 left-1/2 w-64 h-64 rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, var(--color-action), transparent)' }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, var(--color-accent), var(--color-preparation))',
              boxShadow: '0 4px 16px rgba(20, 184, 166, 0.3)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div>
            <h1 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>EMG Acquisition Guide</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Temporal Gesture Data System</p>
          </div>
        </div>
        <Link href="/login" className="btn btn-secondary text-sm">
          Login Admin
        </Link>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-2xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 text-xs font-medium"
            style={{ background: 'rgba(20, 184, 166, 0.1)', border: '1px solid rgba(20, 184, 166, 0.2)', color: 'var(--color-accent)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse-glow" style={{ background: 'var(--color-accent)' }} />
            Master Clock untuk Eksperimen EMG
          </div>

          <h2
            className="text-4xl sm:text-5xl font-bold leading-tight mb-6"
            style={{ color: 'var(--text-primary)' }}
          >
            Pemandu Akuisisi Data{' '}
            <span style={{
              background: 'linear-gradient(135deg, var(--color-accent), var(--color-preparation))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Gesture Temporal
            </span>
          </h2>

          <p className="text-lg mb-10 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Sistem konduktor visual presisi tinggi yang memandu eksperimen sinyal otot (EMG)
            dengan sinkronisasi waktu absolut. Menghasilkan event log dengan presisi milidetik
            untuk pelabelan data otomatis.
          </p>

          {/* Phase Cycle Visualization */}
          <div className="flex items-center justify-center gap-4 mb-10">
            <div className="glass-card px-5 py-3 text-center">
              <div className="w-3 h-3 rounded-full mx-auto mb-2" style={{ background: 'var(--color-preparation)' }} />
              <p className="text-xs font-semibold" style={{ color: 'var(--color-preparation)' }}>Persiapan</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Countdown</p>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
            <div className="glass-card px-5 py-3 text-center">
              <div className="w-3 h-3 rounded-full mx-auto mb-2" style={{ background: 'var(--color-action)' }} />
              <p className="text-xs font-semibold" style={{ color: 'var(--color-action)' }}>Aksi</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Tahan Pose</p>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
            <div className="glass-card px-5 py-3 text-center">
              <div className="w-3 h-3 rounded-full mx-auto mb-2" style={{ background: 'var(--color-rest)' }} />
              <p className="text-xs font-semibold" style={{ color: 'var(--color-rest)' }}>Istirahat</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Relaksasi</p>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" className="rotate-180">
              <path d="M3 12a9 9 0 1 0 9-9" /><path d="M3 3v4h4" />
            </svg>
          </div>

          {/* CTAs */}
          <div className="flex items-center justify-center gap-4">
            <Link href="/session" className="btn btn-primary text-base px-8 py-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="6 3 20 12 6 21 6 3" />
              </svg>
              Mulai Sesi
            </Link>
            <Link href="/admin" className="btn btn-secondary text-base px-8 py-3">
              Dashboard Admin
            </Link>
          </div>
        </div>
      </main>

      {/* Footer Features */}
      <footer className="relative z-10 px-6 pb-8">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              icon: '⏱️',
              title: 'Presisi Milidetik',
              desc: 'Timer berbasis requestAnimationFrame dengan presisi sub-milidetik',
            },
            {
              icon: '📊',
              title: 'Export Data',
              desc: 'Event log terekam otomatis, siap export CSV/JSON untuk analisis',
            },
            {
              icon: '🔄',
              title: 'Sinkronisasi Real-time',
              desc: 'SSE trigger ke modul sensor untuk sinkronisasi waktu nyata',
            },
          ].map((feat) => (
            <div key={feat.title} className="glass-card p-5 text-center">
              <span className="text-2xl">{feat.icon}</span>
              <h3 className="text-sm font-semibold mt-2" style={{ color: 'var(--text-primary)' }}>{feat.title}</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{feat.desc}</p>
            </div>
          ))}
        </div>
      </footer>
    </div>
  )
}
