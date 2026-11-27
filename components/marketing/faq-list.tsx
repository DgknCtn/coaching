'use client'

import { track } from '@/lib/marketing/track'

// SSS akordeonu — yerleşik <details>/<summary> (klavye ve ekran okuyucu
// erişimi tarayıcıdan). `trackPage` verilirse açılış ölçülür (PRD §14
// feature_faq_open); hangi soru açıldığı KAYDEDİLMEZ, yalnız sırası.

export function FaqList({ items, trackPage }: { items: { q: string; a: string }[]; trackPage?: 'features' | 'home' }) {
  return (
    <div className="mt-12 divide-y rounded-lg border bg-card">
      {items.map((faq, i) => (
        <details
          key={faq.q}
          onToggle={e => {
            if (trackPage && (e.currentTarget as HTMLDetailsElement).open) {
              track({ event: 'feature_faq_open', cta: `sss-${i + 1}`, page: trackPage })
            }
          }}
          className="group px-5 py-4 transition-colors hover:bg-muted/40 open:bg-muted/20"
        >
          <summary className="cursor-pointer list-none text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="flex items-start justify-between gap-4">
              {faq.q}
              <span aria-hidden className="mt-0.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-45">
                +
              </span>
            </span>
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
        </details>
      ))}
    </div>
  )
}
