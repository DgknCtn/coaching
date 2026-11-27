'use client'

import { useRef, useState } from 'react'
import { Maximize2, Monitor, Smartphone, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { track } from '@/lib/marketing/track'

// ÖZELLİK EKRANI + BÜYÜTME (PRD §7.3 "Visual interaction", §9.4).
//
// Ekran uygulamanın gerçek bileşenleriyle çizilir (feature-mock.tsx).
// Tıklanınca yerleşik <dialog> açılır: odak tuzağı ve Esc tarayıcıdan
// gelir. Masaüstü/mobil geçişi ekranı 390 px'lik bir KAPTA çizer;
// mockup'lar @container ile düzenlendiği için bu gerçek dar düzendir.

export function FeatureScreenshot({
  children,
  caption,
  feature,
  category,
  phone = false,
}: {
  children: React.ReactNode
  /** Görünür açıklama + dialog başlığı. */
  caption: string
  feature?: string
  category?: string
  /** Telefon çerçeveli ekran: geçiş anlamsız, gizlenir. */
  phone?: boolean
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop')

  function open() {
    dialogRef.current?.showModal()
    track({ event: 'feature_screenshot_click', feature, category, page: 'features' })
  }

  return (
    <figure className="min-w-0">
      {/* Ekran blok içerik (figure/div) taşır; <button> içine konamaz.
          Bu yüzden şeffaf düğme ekranın ÜSTÜNÜ kaplar. */}
      <div className="group relative">
        {children}
        <button
          type="button"
          onClick={open}
          aria-label={`${caption} — büyüt`}
          className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <span className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-md border bg-card/95 px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-sm transition group-hover:text-foreground">
            <Maximize2 className="size-3" />
            Büyüt
          </span>
        </button>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">{caption}</figcaption>

      <dialog
        ref={dialogRef}
        aria-label={caption}
        onClick={e => {
          // Arka plana tıklama kapatır.
          if (e.target === dialogRef.current) dialogRef.current?.close()
        }}
        className="m-auto w-[min(72rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-auto rounded-2xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60"
      >
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur">
          <p className="text-sm font-medium">{caption}</p>
          <div className="flex items-center gap-2">
            {!phone && (
              <div role="group" aria-label="Görünüm" className="inline-flex rounded-lg border p-0.5">
                {(
                  [
                    ['desktop', 'Masaüstü', Monitor],
                    ['mobile', 'Mobil', Smartphone],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={view === key}
                    onClick={() => setView(key)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs',
                      view === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Kapat"
              className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="bg-muted/30 p-4 sm:p-8">
          <div className={cn('mx-auto', phone ? 'w-fit' : view === 'mobile' ? 'w-[390px] max-w-full' : 'max-w-5xl')}>
            {children}
          </div>
        </div>
      </dialog>
    </figure>
  )
}
