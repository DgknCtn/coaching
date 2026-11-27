'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpenCheck, CalendarDays, Check, Smartphone, Users, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionHeading } from './section-heading'
import { HomeworkMock } from './mock/homework-mock'
import { LessonsMock } from './mock/lessons-mock'
import { LedgerMock } from './mock/ledger-mock'
import { ParentMock } from './mock/parent-mock'
import { PhonePreview } from './phone-preview'
import { registerHref } from '@/lib/signup-source'
import { buttonVariants } from '@/components/ui/button'
import { TRIAL_CTA_LABEL } from '@/lib/plans'

// ÜRÜN TURU — "göster, anlatma". Her sekme bir SONUÇ cümlesi, üç madde ve
// uygulamanın gerçek bileşenleriyle çizilmiş bir ekran. Sekmeler WAI-ARIA
// tablist deseninde: ok tuşları, Home/End ve görünür odak.

interface Tab {
  id: string
  label: string
  Icon: typeof BookOpenCheck
  title: string
  bullets: string[]
  mock: React.ReactNode
}

const TABS: Tab[] = [
  {
    id: 'odev',
    label: 'Ödev verme',
    Icon: BookOpenCheck,
    title: 'Kitabı seçin, sayfa aralığını yazın, yayımlayın.',
    bullets: [
      'Kitap Haritası hangi testin yapıldığını, beklediğini ve geciktiğini renkle gösterir.',
      '"2-10" yazıp tek tıkla ödeve ekleyin; son teslim sıradaki dersinize göre kendiliğinden gelir.',
      'Hazır WhatsApp metniyle ödevi öğrenciye tek dokunuşla iletin.',
    ],
    mock: <HomeworkMock />,
  },
  {
    id: 'ogrenci',
    label: 'Öğrencinin haftası',
    Icon: Smartphone,
    title: 'Öğrenci bu haftanın işini telefonunda görür.',
    bullets: [
      "Haftam: bu haftanın görevleri ve tek son teslim — \"Hocam ne yapacaktım?\" sorusu biter.",
      'Tek dokunuşla teslim; öğretmenin notu ve onayı aynı ekranda.',
      'Ana ekrana eklenir, uygulama gibi açılır. E-posta gerekmez: kullanıcı adı + PIN.',
    ],
    mock: (
      <div className="flex justify-center py-2">
        <PhonePreview />
      </div>
    ),
  },
  {
    id: 'ders',
    label: 'Ders & Takvim',
    Icon: CalendarDays,
    title: 'Takviminizdeki ders kendiliğinden İz’e gelir.',
    bullets: [
      'Google Takvim’i bağlayın: öğrenciyle eşleşen dersler haftalık listeye düşer, Meet bağlantısıyla.',
      'Takvimde taşınan ya da iptal edilen ders silinmez; sonucunu siz seçersiniz.',
      'Yapıldı, yapılmadı, telafi: her dersin akıbeti kayıtlı, hiçbiri unutulmaz.',
    ],
    mock: <LessonsMock />,
  },
  {
    id: 'finans',
    label: 'Finans',
    Icon: Wallet,
    title: 'Kim ne kadar ödedi, kimin bakiyesi var — tek bakışta.',
    bullets: [
      'Öğrenci başına cari hesap: dersler, tahsilatlar ve bakiye aynı yerde.',
      'Tutar yalnız ders “Yapıldı” işaretlenince yazılır; tahmin yok.',
      'Veli ödediğini panelinden bildirir, siz onaylarsınız.',
    ],
    mock: <LedgerMock />,
  },
  {
    id: 'veli',
    label: 'Veli paneli',
    Icon: Users,
    title: 'Veli “Çocuğum nasıl gidiyor?” diye sormadan bilir.',
    bullets: [
      'Veli yalnız sizin onayladığınız ilerlemeyi görür: teslim ile onay ayrı.',
      'Geciken işler ve kitap ilerlemesi kendi ekranında.',
      'Hiçbir şeyi değiştiremez; akademik notlarınız ona gösterilmez.',
    ],
    mock: (
      <div className="flex justify-center py-2">
        <ParentMock />
      </div>
    ),
  },
]

export function ProductTour() {
  const [active, setActive] = useState(0)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const tab = TABS[active]

  function focusTab(i: number) {
    const next = (i + TABS.length) % TABS.length
    setActive(next)
    tabRefs.current[next]?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') focusTab(active + 1)
    else if (e.key === 'ArrowLeft') focusTab(active - 1)
    else if (e.key === 'Home') focusTab(0)
    else if (e.key === 'End') focusTab(TABS.length - 1)
    else return
    e.preventDefault()
  }

  return (
    <section id="ozellikler" className="scroll-mt-16 border-y bg-muted/30 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Ürün turu"
          title="Ödev takibinden ders ve ödemeye: koçluğun tamamı tek ekranda."
          description="Aşağıdaki ekranlar uygulamanın kendi bileşenleriyle, örnek veriyle çizildi."
        />

        <div
          role="tablist"
          aria-label="Ürün turu"
          onKeyDown={onKeyDown}
          className="-mx-6 mt-10 flex gap-2 overflow-x-auto px-6 pb-2 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0"
        >
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={el => {
                tabRefs.current[i] = el
              }}
              id={`tur-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-controls={`tur-panel-${t.id}`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                i === active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              <t.Icon className="size-4" />
              {t.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`tur-panel-${tab.id}`}
          aria-labelledby={`tur-tab-${tab.id}`}
          className="mt-10 grid items-center gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
        >
          <div key={tab.id} className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
            <h3 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{tab.title}</h3>
            <ul className="mt-6 space-y-3">
              {tab.bullets.map(b => (
                <li key={b} className="flex items-start gap-2.5 text-sm leading-relaxed">
                  <Check className="mt-0.5 size-4 shrink-0 text-success-foreground" />
                  {b}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link href={registerHref('tur')} className={buttonVariants({ size: 'sm' })}>
                {TRIAL_CTA_LABEL}
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Kayıt olmadan demoda gezin
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/ozellikler"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Tüm özellikler
              </Link>
            </div>
          </div>
          <div
            key={`${tab.id}-mock`}
            className="min-w-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500"
          >
            {tab.mock}
          </div>
        </div>
      </div>
    </section>
  )
}
