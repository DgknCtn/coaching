'use client'

import { Badge } from '@/components/ui/badge'
import type { HaftamCard, HaftamDay } from '@/lib/haftam'
import { WorkCard } from './work-card'

// PLANLANMAMIŞ ÇALIŞMALAR (§6).
//
// ============================================================
// NEDEN HAFTANIN EN ALTINDA, TAM GENİŞLİKTE
//
// Bunlar öğretmenin verdiği ama öğrencinin henüz bir güne koymadığı
// RESMİ çalışmalar. Gün sütunlarının içine dağıtılamazlar (hiçbir güne
// ait değiller) ama gizlenemezler de: haftanın yüküne dahiller ve üst
// özetteki sayılara giriyorlar.
//
// Altta durması bir öncelik ifadesi: öğrenci ekrana "bugün ne
// yapacağım?" sorusuyla geliyor (§4). Planlanmamışlar o sorunun cevabı
// değil, haftanın kalan işi.
//
// ============================================================
// SİSTEM BUNLARI KENDİLİĞİNDEN DAĞITMAZ
//
// Otomatik dağıtım kolay yazılırdı ama kabul kriteri bunu açıkça
// yasaklıyor: öğrencinin mevcut planı sonradan eklenen işlerle otomatik
// yeniden yazılmamalı. Yeni iş burada bekler; nereye gideceğine öğrenci
// karar verir.

export function UnplannedStrip({ cards, days }: { cards: HaftamCard[]; days: HaftamDay[] }) {
  if (cards.length === 0) return null

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Planlanmamışlar</h2>
        <Badge variant="neutral">{cards.length}</Badge>
        <p className="text-xs text-muted-foreground">
          Henüz bir güne yerleştirilmemiş resmi MatMüh çalışmaları.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map(card => (
          <WorkCard key={card.key} card={card} days={days} />
        ))}
      </div>
    </div>
  )
}
