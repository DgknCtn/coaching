'use client'

import { CalendarClock, Flag, Lock, NotebookPen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PACE_BAND_LABEL, type PaceBand } from '@/lib/weekly-flow'
import { counterLabel } from '@/lib/homework-status'
import type { HaftamCard, HaftamDay } from '@/lib/haftam'
import { DayColumn } from './day-column'
import { UnplannedStrip } from './unplanned-strip'

// HAFTAM — etkileşim katmanı (R7-06.03, R8'de V2).
//
// ============================================================
// GÜNE TAŞIMA: İKİ YOL, TEK EYLEM
//
// R7'de burada "neden sürükle-bırak değil" diye bir not vardı: sürükleme
// dar ekranda güvenilir çalışmıyor (dokunma hedefleri çakışıyor, kaydırma
// ile sürükleme ayrışmıyor) ve klavyeyle erişilemiyor.
//
// O GEREKÇE HÂLÂ GEÇERLİ; karar değişen yer başka: V2 belgesi sürüklemeyi
// tarif ediyor ve fare kullanan öğrenci için gerçekten daha hızlı. Bu
// yüzden sürükleme EKLENDİ ama menü KALDI. Menü birincil ve erişilebilir
// yoldur; sürükleme yalnız bir kolaylık katmanıdır. İkisi de aynı sunucu
// eylemini çağırır, o yüzden davranış ayrışamaz.
//
// Sürükleme tek başına bırakılsaydı klavye ve ekran okuyucu kullanan
// öğrenci çalışmasını hiçbir güne koyamazdı.
//
// ============================================================
// SONRADAN EKLENEN İŞ MEVCUT PLANI BOZMAZ
//
// Kabul kriteri: *"Öğrenci çalışmalarını günlere yerleştirebilir ve
// mevcut planı sonradan eklenen işlerle otomatik yeniden yazılmaz."*
// Burada otomatik dağıtan hiçbir kod YOK — bu bir eksiklik değil,
// kuralın kendisi. Yeni iş `planned_for_date = NULL` doğar ve
// "planlanmadı" olarak bekler.

export interface HaftamView {
  startsAt: string
  dueAt: string
  dueSource: 'anchor' | 'custom'
  /** Son teslimin metni — lib/weekly-flow.ts `dueLabel` üretir. */
  dueText: string
  total: number
  delivered: number
  remaining: number
  distribution: { planned: number; total: number; unplanned: number; phrase: string }
  pace: { startingPerDay: number; requiredPerDay: number; band: PaceBand } | null
  days: HaftamDay[]
  unplanned: HaftamCard[]
}

const BAND_VARIANT: Record<PaceBand, 'success' | 'warning' | 'destructive'> = {
  good: 'success',
  slightly_behind: 'warning',
  clearly_behind: 'warning',
  critical: 'destructive',
}

function perDay(n: number): string {
  // Ondalık bir "çalışma" yoktur; yukarı yuvarlanır çünkü 19,2 çalışma
  // gerekiyorsa 19 yetmez. Öğretmen ekranıyla aynı kural.
  return `${Math.ceil(n)} çalışma/gün`
}

export function HaftamClient({ view }: { view: HaftamView }) {
  return (
    <div className="space-y-6">
      {/* ============================================================
          ÜST RESMİ HAFTA ÖZETİ (§3)

          Bu özet YALNIZ MatMüh tarafından verilen resmi çalışmaları
          kapsar. Kişisel ajanda maddeleri buraya GİRMEZ ve bu cümle
          ekranda da yazılı: öğrenci "10 sayfa kitap oku" yazdığı için
          haftalık yükünün arttığını sanmamalı.
          ============================================================ */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div className="min-w-48 flex-1">
            <p className="text-sm font-medium">Haftalık Özet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Bu özet yalnızca MatMüh tarafından verilen resmi çalışmaları kapsar.
              Kişisel ajanda öğeleri dahil değildir.
            </p>
          </div>

          <SummaryStat value={view.total} label="çalışma" hint="Toplam atanmış" />
          <SummaryStat
            value={view.delivered}
            label={counterLabel('completed', 'student')}
            hint="Tamamlanan"
          />
          <SummaryStat
            value={view.remaining}
            label="kaldı"
            hint="Tamamlanmayan"
            emphasis={view.remaining > 0}
          />

          {view.pace && (
            <div className="min-w-40">
              <Badge variant={BAND_VARIANT[view.pace.band]}>
                {PACE_BAND_LABEL[view.pace.band]}
              </Badge>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Şimdi gereken {perDay(view.pace.requiredPerDay)}
              </p>
            </div>
          )}

          {/* RESMİ SON TESLİM — öğrencinin kendi planından AYRI.
              İkisi ayrışmazsa hangisinin bağlayıcı olduğu belirsizleşir. */}
          <div className="min-w-44">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Flag className="size-3.5" />
              Resmi son teslim
              {view.dueSource === 'custom' && ' (öğretmenin seçtiği)'}
            </p>
            <p className="mt-1 text-sm font-medium">{view.dueText}</p>
          </div>
        </div>

        <p className="mt-3 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
          <CalendarClock className="size-3.5 shrink-0" />
          {view.distribution.phrase}
        </p>
      </div>

      {/* ============================================================
          GÜN SÜTUNLARI (§2)

          Masaüstünde yedi sütun yan yana. HER SÜTUNUN KENDİ SCROLL'U
          YOK — sayfanın tamamı tek parça aşağı kayar; aksi halde
          öğrenci hangi içeriğin hangi güne ait olduğunu kaybeder.

          Dar ekranda sütunlar alt alta iner: yedi sütunu telefona
          sıkıştırmak, her birini okunamaz hale getirirdi.
          ============================================================ */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {view.days.map(day => (
          <DayColumn key={day.date} day={day} days={view.days} />
        ))}
      </div>

      {/* PLANLANMAMIŞLAR (§6) — haftanın en altında, tam genişlikte. */}
      <UnplannedStrip cards={view.unplanned} days={view.days} />
    </div>
  )
}

function SummaryStat({
  value,
  label,
  hint,
  emphasis,
}: {
  value: number
  label: string
  hint: string
  emphasis?: boolean
}) {
  return (
    <div className="min-w-20">
      <p
        className={
          emphasis
            ? 'text-2xl font-semibold tabular-nums text-destructive'
            : 'text-2xl font-semibold tabular-nums'
        }
      >
        {value}
      </p>
      <p className="text-xs font-medium">{label}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}

/** Gün sütunlarında ve planlanmamışlar şeridinde paylaşılan başlıklar. */
export const SECTION_ICONS = { note: NotebookPen, personal: Lock }
