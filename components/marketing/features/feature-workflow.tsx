'use client'

import { useRef, useState } from 'react'
import { BookOpenCheck, CalendarCheck, Check, CheckCircle2, Eye, Send, TrendingUp, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

// İŞ AKIŞI (PRD §7.3 Section 14): öğretmen → öğrenci → veli zinciri, 7
// adım. Her adım tıklanabilir; kısa açıklama ve o adımın ekran parçası
// görünür. WAI-ARIA tablist (dikey): ok tuşları, Home/End.

interface Step {
  title: string
  who: 'Öğretmen' | 'Öğrenci' | 'Veli' | 'İZ'
  text: string
  Icon: typeof Check
  visual: React.ReactNode
}

const Chip = ({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'primary' | 'success' | 'warning' }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs',
      tone === 'primary' && 'border-primary bg-primary text-primary-foreground',
      tone === 'success' && 'border-success-border bg-success-subtle text-success-foreground',
      tone === 'warning' && 'border-warning-border bg-warning-subtle text-warning-foreground',
      tone === 'neutral' && 'bg-card text-muted-foreground'
    )}
  >
    {children}
  </span>
)

const STEPS: Step[] = [
  {
    title: 'Kitap Haritası’ndan görev seçer',
    who: 'Öğretmen',
    text: 'Kitabı seçer, sayfa ya da test aralığını yazar. Harita neyin yapıldığını ve neyin beklediğini renkle gösterir.',
    Icon: BookOpenCheck,
    visual: (
      <div className="flex flex-wrap items-center gap-2">
        <Chip>Problemler</Chip>
        <Chip>Test 5-7</Chip>
        <Chip tone="primary">+ Ödeve ekle</Chip>
      </div>
    ),
  },
  {
    title: 'Haftalık Akış’a ekler ve yayımlar',
    who: 'Öğretmen',
    text: 'Son teslim öğrencinin sıradaki dersine göre kendiliğinden gelir. Kapanmamış hafta varsa yayımlarken sorulur.',
    Icon: CalendarCheck,
    visual: (
      <div className="flex flex-wrap items-center gap-2">
        <Chip>3 test · 9 sayfa</Chip>
        <Chip>Son teslim: sıradaki ders</Chip>
        <Chip tone="primary">
          <Send className="size-3" /> Planı yayımla
        </Chip>
      </div>
    ),
  },
  {
    title: 'Öğrenci görevlerini görür',
    who: 'Öğrenci',
    text: 'Haftam ekranında bu haftanın işi ve tek son teslim. İşleri günlere kendisi dağıtır.',
    Icon: Eye,
    visual: (
      <div className="flex flex-wrap items-center gap-2">
        <Chip>Haftam</Chip>
        <Chip>Pzt: Test 5</Chip>
        <Chip>Sal: Test 6-7</Chip>
      </div>
    ),
  },
  {
    title: 'Öğrenci teslim eder',
    who: 'Öğrenci',
    text: 'Tamamladığını tek dokunuşla bildirir. Bu bir beyandır; ilerlemeye henüz sayılmaz.',
    Icon: Send,
    visual: (
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="warning">Teslim ettin · onay bekliyor</Chip>
      </div>
    ),
  },
  {
    title: 'Öğretmen onaylar',
    who: 'Öğretmen',
    text: 'Kontrol edip onaylar ya da notla iade eder. Yalnız onaylanan iş kayda geçer.',
    Icon: CheckCircle2,
    visual: (
      <div className="flex flex-wrap items-center gap-2">
        <Chip>İade et</Chip>
        <Chip tone="primary">
          <Check className="size-3" /> Onayla
        </Chip>
      </div>
    ),
  },
  {
    title: 'İlerleme güncellenir',
    who: 'İZ',
    text: 'Kitap ilerlemesi ve öğrenci durumu onaylı işe göre yeniden hesaplanır.',
    Icon: TrendingUp,
    visual: (
      <div className="flex items-center gap-3 text-xs">
        <span className="tabular-nums text-muted-foreground">%62</span>
        <div className="h-1.5 w-40 rounded-full bg-muted">
          <div className="h-1.5 w-[66%] rounded-full bg-primary" />
        </div>
        <span className="font-semibold tabular-nums text-success-foreground">%66</span>
      </div>
    ),
  },
  {
    title: 'Veli aynı veriyi takip eder',
    who: 'Veli',
    text: 'Veli kendi ekranında öğretmenin onayladığı ilerlemeyi görür; hiçbir şeyi değiştiremez.',
    Icon: Users,
    visual: (
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="success">Öğretmen onaylı: 7/8</Chip>
        <Chip>Geciken: 1</Chip>
      </div>
    ),
  },
]

export function FeatureWorkflow() {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const step = STEPS[active]

  function go(i: number) {
    const next = (i + STEPS.length) % STEPS.length
    setActive(next)
    refs.current[next]?.focus()
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <ol
        role="tablist"
        aria-orientation="vertical"
        aria-label="İZ’de süreç adımları"
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') go(active + 1)
          else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') go(active - 1)
          else if (e.key === 'Home') go(0)
          else if (e.key === 'End') go(STEPS.length - 1)
          else return
          e.preventDefault()
        }}
        className="relative space-y-1"
      >
        {STEPS.map((s, i) => (
          <li key={s.title} role="presentation">
            <button
              ref={el => {
                refs.current[i] = el
              }}
              id={`akis-adim-${i}`}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-controls="akis-panel"
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary',
                i === active ? 'bg-primary/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums',
                  i === active ? 'border-primary bg-primary text-primary-foreground' : i < active ? 'border-primary/40 text-primary' : 'bg-card'
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">{s.who}</span>
                {s.title}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div
        id="akis-panel"
        role="tabpanel"
        aria-labelledby={`akis-adim-${active}`}
        className="self-center rounded-xl border bg-card p-6 shadow-sm"
      >
        <div key={active} className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
            <step.Icon className="size-4" />
            Adım {active + 1} / {STEPS.length} · {step.who}
          </p>
          <h3 className="mt-3 text-xl font-semibold tracking-tight">{step.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
          <div className="mt-6 rounded-lg border bg-muted/30 p-4">{step.visual}</div>
          <div className="mt-6 flex justify-between text-xs">
            <button
              type="button"
              onClick={() => setActive(Math.max(0, active - 1))}
              disabled={active === 0}
              className="text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              ← Önceki
            </button>
            <button
              type="button"
              onClick={() => setActive(Math.min(STEPS.length - 1, active + 1))}
              disabled={active === STEPS.length - 1}
              className="font-medium text-primary disabled:opacity-40"
            >
              Sonraki →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
