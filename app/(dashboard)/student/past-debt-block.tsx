'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, History } from 'lucide-react'
import { batchStateLabel, type HomeworkBatchState } from '@/lib/homework-status'
import { HomeworkList } from './homework-list'

// GEÇMİŞ BORÇ BLOĞU — R7-06.02.
//
// ============================================================
// NEDEN AYRI VE NEDEN KAPALI
//
// Öğrenci ekrana girdiğinde önce 5 eski gecikmiş ödev görüyordu; aktif
// haftanın işi aşağıya gömülüyordu. Belgenin istediği düzen: güncel
// hafta ekranın ilk çalışma alanı, geçmiş borç *"ayrı ve varsayılan
// kapalı blokta"*.
//
// Geçmiş borç GİZLENMİYOR — kaldırılmıyor da. Öğrenci onu görebilir,
// açabilir, çalışabilir. Değişen tek şey: ekranı ilk açtığında karşısına
// çıkan iş bu haftanın işi oluyor.
//
// ============================================================
// NEDEN CLIENT BİLEŞENİ, NEDEN <details> DEĞİL
//
// Kabul kriteri: *"51 sayfalık bir eski ödev yalnız Detayı aç denince
// satırlarına iner."* `<details>` bunu KARŞILAMAZ: içerik kapalıyken de
// DOM'a basılır ve hidrasyon maliyetini öder. Onlarca test/sayfa taşıyan
// beş ödevde bu, ilk ekranın açılışını yavaşlatan sessiz bir yük olurdu.
//
// Burada içerik yalnız açıldığında MOUNT ediliyor — kapalıyken hiç
// render edilmiyor.

export interface PastDebtSection {
  state: HomeworkBatchState
  // Ödev verisi zaten düz JSON; sunucudan istemciye geçmesinde sorun yok.
  items: unknown[]
}

export function PastDebtBlock({
  openCount,
  overdueCount,
  hasCurrentWeek,
  sections,
}: {
  /** Geçmişten kalan AÇIK ödev sayısı (geciken + iade + yapılacak). */
  openCount: number
  /** Bunların kaçı gecikmiş — özet cümlesinin asıl bilgisi. */
  overdueCount: number
  /**
   * Aktif hafta var mı?
   *
   * Yoksa bu blok "geçmiş" değildir: öğrencinin TEK çalışma alanıdır ve
   * kapalı gelmesi yanlış olurdu — ekran bomboş görünürdü.
   */
  hasCurrentWeek: boolean
  sections: PastDebtSection[]
}) {
  const [open, setOpen] = useState(!hasCurrentWeek)

  const summary = hasCurrentWeek
    ? overdueCount > 0
      ? `Geçmişten ${overdueCount} gecikmiş ödev`
      : `Geçmişten ${openCount} açık ödev`
    : 'Açık ödevlerim'

  return (
    <section className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <History className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 text-sm font-medium">{summary}</span>
        {/* Kapalıyken kaç ödev olduğu görünür kalmalı: blok kapalı diye
            borç yok sayılmasın. */}
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {openCount} ödev
        </span>
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="space-y-6 border-t p-4">
          {sections.map(section => (
            <div key={section.state} className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {batchStateLabel(section.state, 'student')}
              </p>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <HomeworkList batches={section.items as any} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
