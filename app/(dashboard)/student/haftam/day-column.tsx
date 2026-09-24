'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Lock, NotebookPen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HaftamDay } from '@/lib/haftam'
import { WEEKDAY_SHORT_LABEL, type Weekday } from '@/lib/service-structure'
import { WorkCard } from './work-card'
import { DayNote } from './day-note'
import { PersonalItems } from './personal-items'
import { setPlanDatesAction } from './actions'

// GÜN SÜTUNU (§2, §4).
//
// ============================================================
// SÜTUN İÇİ SIRA V1'DE KİLİTLENDİ
//
//   1. MatMüh Çalışmaları
//   2. Günün Akademik Notu
//   3. Kişisel Alan
//
// Sebep belgede yazılı: öğrenci Haftam'a esas olarak "Bugün ne
// yapacağım?" sorusuyla gelir. Resmi akademik çalışmalar ilk bakışta
// görünmelidir. Kişisel alan en altta çünkü orası öğrencinin kendi
// hayatı — önemli ama günün akademik sorusunun cevabı değil.
//
// Bu sıra BİLEŞENDE SABİT, bir ayar değil: yapılandırılabilir olsaydı
// ekranın ne söylediği öğrenciden öğrenciye değişirdi.
// ============================================================

const MONTHS = [
  '',
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
]

/** `22 Eyl` — sütun başlığındaki kısa tarih. */
export function shortDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(day)} ${MONTHS[Number(month)]}`
}

export function DayColumn({ day, days }: { day: HaftamDay; days: HaftamDay[] }) {
  const [isDragOver, setDragOver] = useState(false)
  const [, startTransition] = useTransition()

  // BİRİM ÇALIŞMA, KART DEĞİL. İlk yazımda burada kartlar sayılıyordu ve
  // başlık "2 çalışma · 1 kaldı" gibi kendi kendini yalanlayan bir satır
  // üretiyordu: soldaki sayı kalemleri, sağdaki kartları sayıyordu. Kart
  // bir görüntüleme birimi (§7); öğrencinin saydığı şey çalışmadır.
  const openCount = day.cards.reduce(
    (n, card) => n + card.works.filter(w => !w.submitted).length,
    0
  )
  const isSunday = day.weekday === 7

  // ============================================================
  // SÜRÜKLEME HEDEFİ
  //
  // Kütüphane kullanılmıyor: taşınan şey tek bir kimlik listesi ve
  // HTML5 sürükleme bunun için yeterli. Bir sürükleme kütüphanesi
  // eklemek, klavye yolu zaten menüyle karşılandığı için yalnız paket
  // boyutu ve ikinci bir davranış kaynağı getirirdi.
  //
  // Sürükleme DOKUNMAYI KAPSAMAZ; dokunmatik cihazda menü yolu çalışır.
  // ============================================================
  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    setDragOver(false)

    const raw = event.dataTransfer.getData('application/x-haftam-items')
    if (!raw) return

    let ids: string[]
    try {
      ids = JSON.parse(raw) as string[]
    } catch {
      return
    }
    if (!Array.isArray(ids) || ids.length === 0) return

    startTransition(async () => {
      const res = await setPlanDatesAction(ids, day.date)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${WEEKDAY_SHORT_LABEL[day.weekday as Weekday]} gününe taşındı.`)
    })
  }

  return (
    <div
      onDragOver={e => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col rounded-lg border bg-card p-3 transition-colors',
        isDragOver && 'border-primary bg-primary/5'
      )}
    >
      {/* STICKY BAŞLIK: sayfa aşağı kayarken gün başlığı üstte kalır,
          böylece öğrenci hangi içeriğin hangi güne ait olduğunu
          kaybetmez (§2). */}
      <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-3 rounded-t-lg border-b bg-card px-3 pb-2 pt-3">
        <p className={cn('text-sm font-semibold', isSunday && 'text-destructive')}>
          {shortDate(day.date)} {WEEKDAY_SHORT_LABEL[day.weekday as Weekday]}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {day.planned} çalışma · {openCount} kaldı
        </p>
      </div>

      {/* 1) MATMÜH ÇALIŞMALARI */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          MatMüh Çalışmaları
        </h3>
        {day.cards.length === 0 ? (
          <p className="rounded-md border border-dashed px-2 py-3 text-center text-[11px] text-muted-foreground">
            Bu güne çalışma koymadın
          </p>
        ) : (
          day.cards.map(card => <WorkCard key={card.key} card={card} days={days} />)
        )}
      </section>

      {/* 2) GÜNÜN AKADEMİK NOTU */}
      <section className="mt-4 space-y-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <NotebookPen className="size-3" />
          Gün Notu
        </h3>
        <DayNote date={day.date} note={day.dayNote} />
      </section>

      {/* 3) KİŞİSEL ALAN — öğretmene ve veliye GÖRÜNMEZ (§14).
          Kilit ikonu bir süs değil: öğrencinin buraya yazarken
          gizliliğinden emin olması, alanın çalışmasının ön şartı. */}
      <section className="mt-4 space-y-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Lock className="size-3" />
          Kişisel Ajanda
        </h3>
        <PersonalItems date={day.date} items={day.personalItems} />
      </section>
    </div>
  )
}
