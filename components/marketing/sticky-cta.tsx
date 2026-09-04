'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { TRIAL_DAYS } from '@/lib/plans'
import { cn } from '@/lib/utils'

// MOBİLDE YAPIŞKAN CTA.
//
// ============================================================
// NEDEN
//
// Telefonda sayfa uzun: hero'daki düğme birkaç kaydırmada ekrandan
// çıkıyor ve sonraki CTA fiyatlandırmaya kadar gelmiyor. Aradaki tüm
// mesafede, ikna olmuş bir okuyucunun basacağı hiçbir şey yok.
//
// YALNIZ MOBİLDE (`sm:hidden`): masaüstünde navbar zaten sabit ve
// içinde CTA var; orada ikinci bir şerit ekranı daraltmaktan başka bir
// şey yapmaz.
//
// HERO GEÇİLDİKTEN SONRA görünür. En baştan göstermek, hero'nun kendi
// düğmesiyle çakışıp aynı eylemi iki kez sunardı.
//
// Güvence cümlesi burada da var: kart itirazı, CTA'nın olduğu her yerde
// karşılanmalı.
// ============================================================

export function StickyCta() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function onScroll() {
      // Kabaca hero yüksekliği. Eşiği aşınca göster.
      setVisible(window.scrollY > 600)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-4 py-3 backdrop-blur transition-transform duration-200 sm:hidden',
        visible ? 'translate-y-0' : 'translate-y-full'
      )}
      // Görünmezken klavye ve ekran okuyucudan da çıkmalı; aksi hâlde
      // kullanıcı göremediği bir düğmeye odaklanır.
      aria-hidden={!visible}
      {...(!visible ? { inert: '' as unknown as boolean } : {})}
    >
      <Link href="/register" className={buttonVariants({ className: 'w-full' })}>
        {TRIAL_DAYS} Gün Ücretsiz Dene
      </Link>
      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
        Kredi kartı istemiyoruz · Otomatik yenileme yok
      </p>
    </div>
  )
}
