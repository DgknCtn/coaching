import Link from 'next/link'
import { ArrowRight, Play } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center pt-16 pb-16 sm:pb-24 overflow-hidden auth-hero dot-grid">
      {/* Purple ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 70%, oklch(0.57 0.26 282 / 0.12) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 text-center">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold mb-6 sm:mb-8 border"
          style={{
            background: 'oklch(0.57 0.26 282 / 0.12)',
            borderColor: 'oklch(0.57 0.26 282 / 0.35)',
            color: 'oklch(0.78 0.14 282)',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0" />
          Türkiye&apos;nin Koçluk Takip Platformu
        </div>

        {/* Heading */}
        <h1 className="text-3xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white mb-4 sm:mb-6 leading-[1.1] sm:leading-[1.05]">
          Öğrencilerinizin
          <br className="hidden sm:block" />
          {' '}Başarısını
          <br />
          <span
            style={{
              background:
                'linear-gradient(135deg, oklch(0.78 0.18 282), oklch(0.88 0.12 310))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Tam Olarak Takip Edin
          </span>
        </h1>

        {/* Subheading */}
        <p className="text-base sm:text-xl text-white/55 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed">
          Ödevleri, kitap ilerlemelerini ve risk analizini tek platformda yönetin.
          Koç, öğrenci ve veliler için bütünleşik bir ekosistem.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mb-10 sm:mb-20 px-4 sm:px-0">
          <Link
            href="/register"
            className={buttonVariants({ size: 'lg' })}
            style={{
              height: '3rem',
              padding: '0 2rem',
              fontSize: '1rem',
              fontWeight: 600,
              background: 'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))',
              border: 'none',
              boxShadow: '0 10px 40px oklch(0.57 0.26 282 / 0.3)',
            }}
          >
            Ücretsiz Başla
            <ArrowRight className="size-4 ml-2" />
          </Link>
          <Link
            href="/demo"
            className={buttonVariants({ variant: 'outline' })}
            style={{
              height: '3rem',
              padding: '0 2rem',
              fontSize: '1rem',
              fontWeight: 600,
              borderColor: 'oklch(1 0 0 / 0.2)',
              color: 'white',
              background: 'oklch(1 0 0 / 0.05)',
            }}
          >
            <Play className="size-4 mr-2 fill-current" />
            Demoyu Gör
          </Link>
        </div>

        {/* ── Mobile preview: simple stat cards + student list ── */}
        <div className="sm:hidden w-full max-w-sm mx-auto">
          <div
            className="rounded-2xl border border-white/10 overflow-hidden shadow-2xl"
            style={{ background: 'oklch(0.12 0.03 265)' }}
          >
            {/* Mini chrome bar */}
            <div
              className="flex items-center gap-2 px-3 py-2 border-b border-white/5"
              style={{ background: 'oklch(0.09 0.025 260)' }}
            >
              <div className="flex gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
              </div>
              <div
                className="flex-1 mx-2 h-4 rounded text-[10px] flex items-center justify-center"
                style={{ background: 'oklch(0.16 0.03 260)', color: 'oklch(0.5 0.02 260)' }}
              >
                koçtakip.com/teacher
              </div>
            </div>

            <div className="p-3 space-y-3">
              {/* 2×2 stat cards */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: '24', l: 'Öğrenci', g: 'linear-gradient(135deg, oklch(0.52 0.25 282), oklch(0.44 0.22 265))' },
                  { v: '87%', l: 'Tamamlama', g: 'linear-gradient(135deg, oklch(0.50 0.18 155), oklch(0.43 0.16 168))' },
                  { v: '5', l: 'Geciken', g: 'linear-gradient(135deg, oklch(0.54 0.22 20), oklch(0.47 0.20 8))' },
                  { v: '3', l: 'Risk', g: 'linear-gradient(135deg, oklch(0.70 0.18 65), oklch(0.62 0.21 48))' },
                ].map((s) => (
                  <div key={s.l} className="rounded-xl p-3" style={{ background: s.g }}>
                    <div className="text-[10px] font-semibold mb-1" style={{ color: 'oklch(1 0 0 / 0.6)' }}>
                      {s.l}
                    </div>
                    <div className="text-white font-black text-xl leading-none">{s.v}</div>
                  </div>
                ))}
              </div>

              {/* Student rows */}
              <div
                className="rounded-xl border border-white/5 overflow-hidden"
                style={{ background: 'oklch(0.16 0.035 265)' }}
              >
                {[
                  { name: 'Ayşe Y.', pct: 92, status: 'green' },
                  { name: 'Mehmet K.', pct: 67, status: 'yellow' },
                  { name: 'Zeynep A.', pct: 34, status: 'red' },
                ].map((row) => (
                  <div
                    key={row.name}
                    className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/5 last:border-0"
                  >
                    <div
                      className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-black text-white"
                      style={{ background: 'oklch(0.57 0.26 282 / 0.45)' }}
                    >
                      {row.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold mb-1" style={{ color: 'oklch(0.85 0.01 260)' }}>
                        {row.name}
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'oklch(0.22 0.03 265)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${row.pct}%`,
                            background:
                              row.status === 'green'
                                ? 'oklch(0.60 0.18 155)'
                                : row.status === 'yellow'
                                  ? 'oklch(0.75 0.18 65)'
                                  : 'oklch(0.60 0.22 20)',
                          }}
                        />
                      </div>
                    </div>
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        row.status === 'green' ? 'bg-emerald-400' : row.status === 'yellow' ? 'bg-amber-400' : 'bg-red-400'
                      }`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Desktop preview: full browser mockup ── */}
        <div className="hidden sm:block relative mx-auto max-w-4xl">
          {/* Glow behind frame */}
          <div
            className="absolute -inset-4 blur-3xl opacity-20 rounded-3xl pointer-events-none"
            style={{ background: 'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))' }}
          />

          {/* Browser frame */}
          <div
            className="relative rounded-2xl border border-white/10 overflow-hidden shadow-2xl"
            style={{ background: 'oklch(0.12 0.03 265)' }}
          >
            {/* Browser chrome */}
            <div
              className="flex items-center gap-2 px-4 py-3 border-b border-white/5"
              style={{ background: 'oklch(0.09 0.025 260)' }}
            >
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-amber-500/70" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
              </div>
              <div className="flex-1 mx-4">
                <div
                  className="max-w-xs mx-auto h-5 rounded-md px-3 flex items-center justify-center text-[11px]"
                  style={{ background: 'oklch(0.16 0.03 260)', color: 'oklch(0.5 0.02 260)' }}
                >
                  koçtakip.com/teacher
                </div>
              </div>
            </div>

            {/* App layout */}
            <div className="flex" style={{ minHeight: '280px' }}>
              {/* Mini sidebar */}
              <div
                className="w-14 shrink-0 border-r border-white/5 py-4 px-2 flex flex-col items-center gap-3"
                style={{ background: 'oklch(0.065 0.028 255)' }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, oklch(0.57 0.26 282 / 0.35), oklch(0.50 0.22 265 / 0.15))' }}
                >
                  <div className="w-3 h-3 rounded-sm" style={{ background: 'oklch(0.68 0.22 282)' }} />
                </div>
                <div className="flex flex-col gap-2 mt-1 w-full">
                  {[true, false, false, false].map((active, i) => (
                    <div
                      key={i}
                      className="relative w-full h-7 rounded-lg flex items-center justify-center"
                      style={{ background: active ? 'oklch(0.57 0.26 282 / 0.2)' : 'transparent' }}
                    >
                      {active && (
                        <div
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r-full"
                          style={{ background: 'oklch(0.68 0.22 282)' }}
                        />
                      )}
                      <div
                        className="w-4 h-0.5 rounded-full"
                        style={{ background: active ? 'oklch(0.78 0.18 282)' : 'oklch(0.35 0.02 260)' }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Content area */}
              <div className="flex-1 p-4 overflow-hidden">
                {/* Page header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="h-3.5 w-28 rounded-md mb-1" style={{ background: 'oklch(0.88 0.01 260)' }} />
                    <div className="h-2.5 w-44 rounded-md" style={{ background: 'oklch(0.35 0.02 260)' }} />
                  </div>
                  <div
                    className="h-7 w-24 rounded-lg"
                    style={{ background: 'linear-gradient(135deg, oklch(0.52 0.25 282), oklch(0.44 0.22 265))' }}
                  />
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[
                    { v: '24', l: 'Öğrenci', g: 'linear-gradient(135deg, oklch(0.52 0.25 282), oklch(0.44 0.22 265))' },
                    { v: '87%', l: 'Tamamlama', g: 'linear-gradient(135deg, oklch(0.50 0.18 155), oklch(0.43 0.16 168))' },
                    { v: '5', l: 'Geciken', g: 'linear-gradient(135deg, oklch(0.54 0.22 20), oklch(0.47 0.20 8))' },
                    { v: '3', l: 'Risk', g: 'linear-gradient(135deg, oklch(0.70 0.18 65), oklch(0.62 0.21 48))' },
                  ].map((s) => (
                    <div key={s.l} className="rounded-xl p-3 relative overflow-hidden" style={{ background: s.g }}>
                      <div className="text-[9px] font-semibold mb-1" style={{ color: 'oklch(1 0 0 / 0.6)' }}>
                        {s.l}
                      </div>
                      <div className="text-white font-black text-lg leading-none">{s.v}</div>
                    </div>
                  ))}
                </div>

                {/* Student rows */}
                <div className="rounded-xl border border-white/5 overflow-hidden" style={{ background: 'oklch(0.16 0.035 265)' }}>
                  <div
                    className="px-3 py-2 border-b border-white/5"
                    style={{ background: 'oklch(0.14 0.03 265)' }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'oklch(0.6 0.02 260)' }}>
                      Öğrenciler
                    </span>
                  </div>
                  {[
                    { name: 'Ayşe Y.', pct: 92, status: 'green' },
                    { name: 'Mehmet K.', pct: 67, status: 'yellow' },
                    { name: 'Zeynep A.', pct: 34, status: 'red' },
                    { name: 'Ali R.', pct: 78, status: 'green' },
                  ].map((row) => (
                    <div key={row.name} className="flex items-center gap-3 px-3 py-2 border-b border-white/5 last:border-0">
                      <div
                        className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-black text-white"
                        style={{ background: 'oklch(0.57 0.26 282 / 0.45)' }}
                      >
                        {row.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold mb-1" style={{ color: 'oklch(0.85 0.01 260)' }}>
                          {row.name}
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'oklch(0.22 0.03 265)' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${row.pct}%`,
                              background:
                                row.status === 'green'
                                  ? 'oklch(0.60 0.18 155)'
                                  : row.status === 'yellow'
                                    ? 'oklch(0.75 0.18 65)'
                                    : 'oklch(0.60 0.22 20)',
                            }}
                          />
                        </div>
                      </div>
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          row.status === 'green' ? 'bg-emerald-400' : row.status === 'yellow' ? 'bg-amber-400' : 'bg-red-400'
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Reflection fade */}
          <div
            className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
            style={{ background: 'linear-gradient(to top, oklch(0.07 0.03 255), transparent)' }}
          />
        </div>
      </div>
    </section>
  )
}
