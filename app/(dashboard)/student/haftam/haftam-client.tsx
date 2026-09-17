'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CalendarClock, CircleCheck, Hourglass, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { NativeSelect } from '@/components/ui/native-select'
import { MetricRow } from '@/components/shared/metric-row'
import { Section } from '@/components/shared/section'
import { PACE_BAND_LABEL, type PaceBand } from '@/lib/weekly-flow'
import { counterLabel } from '@/lib/homework-status'
import { cn } from '@/lib/utils'
import { setPlanDateAction } from './actions'

// HAFTAM — etkileşim katmanı (R7-06.03).
//
// ============================================================
// NEDEN SÜRÜKLE-BIRAK DEĞİL
//
// Belge "öğrenci haftalık yükü günlere dağıtabilmeli" diyor, yöntemi
// şart koşmuyor. Sürükle-bırak 400px genişlikte güvenilir çalışmıyor
// (dokunma hedefleri çakışıyor, kaydırma ile sürükleme ayrışmıyor) ve
// klavyeyle erişilemiyor. Her çalışma satırında bir gün seçici hem
// dokunmada hem klavyede çalışıyor ve aynı işi yapıyor.
//
// ============================================================
// SONRADAN EKLENEN İŞ MEVCUT PLANI BOZMAZ
//
// Kabul kriteri: *"Öğrenci çalışmalarını günlere yerleştirebilir ve
// mevcut planı sonradan eklenen işlerle otomatik yeniden yazılmaz."*
// Burada otomatik dağıtan hiçbir kod YOK — bu bir eksiklik değil,
// kuralın kendisi. Yeni iş `planned_for_date = NULL` doğar ve
// "planlanmadı" olarak bekler.

export interface HaftamWork {
  id: string
  bookTitle: string
  sectionTitle: string
  testTitle: string
  /** Öğrencinin koyduğu gün (YYYY-MM-DD) — planlanmadıysa null. */
  plannedForDate: string | null
  /** Öğrenci onaya gönderdi mi (ilerlemenin ölçütü). */
  submitted: boolean
  /** Öğretmen onayladı mı — nihai "Tamamlandı". */
  approved: boolean
  /** Öğretmen iade etti mi. */
  returned: boolean
  /** Hafta ortasında eklendi mi. */
  lateAdded: boolean
}

export interface HaftamDay {
  date: string
  weekday: number
  delivered: number
  planned: number
}

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
}

const WEEKDAY_SHORT = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

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

/** `17 Eyl` — gün seçicideki kısa etiket. */
function shortDate(date: string): string {
  const [, month, day] = date.split('-')
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
  return `${Number(day)} ${MONTHS[Number(month)]}`
}

export function HaftamClient({ view, works }: { view: HaftamView; works: HaftamWork[] }) {
  return (
    <div className="space-y-6">
      {/* ============================================================
          HAFTANIN ÖZETİ — kabul kriteri "6 / 0 / 6"
          ============================================================ */}
      <MetricRow
        className="grid-cols-3"
        metrics={[
          { label: 'Bu haftanın yükü', value: view.total },
          { label: counterLabel('completed', 'student'), value: view.delivered },
          { label: 'Kalan', value: view.remaining },
        ]}
      />

      {/* RESMİ SON TESLİM — öğrencinin kendi planından AYRI ve üstte.
          İkisi yan yana dursaydı hangisinin bağlayıcı olduğu
          belirsizleşirdi. */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" />
              Resmi son teslim
              {view.dueSource === 'custom' && ' (öğretmenin seçtiği)'}
            </p>
            <p className="mt-1 font-medium">{view.dueText}</p>
          </div>
          {view.pace && (
            <div className="text-right">
              <Badge variant={BAND_VARIANT[view.pace.band]}>
                {PACE_BAND_LABEL[view.pace.band]}
              </Badge>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Başlangıç temposu {perDay(view.pace.startingPerDay)}
              </p>
              <p className="text-xs text-muted-foreground">
                Şimdi gereken {perDay(view.pace.requiredPerDay)}
              </p>
            </div>
          )}
        </div>
        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          {view.distribution.phrase}
        </p>
      </div>

      {/* ============================================================
          GÜNLÜK HAREKET — plan ve gerçekleşen yan yana
          ============================================================
          İki eksen bilinçli olarak AYNI satırda: öğrencinin kendi
          niyetini ve gerçekte ne teslim ettiğini karşılaştırabilmesi
          ekranın asıl işi. */}
      <Section title="Günlerim">
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-2">
            {view.days.map(day => (
              <div
                key={day.date}
                className="w-20 shrink-0 rounded-lg border bg-card p-2 text-center"
              >
                <p className="text-xs font-medium">{WEEKDAY_SHORT[day.weekday]}</p>
                <p className="text-[11px] text-muted-foreground">{shortDate(day.date)}</p>
                <p className="mt-2 text-lg font-semibold tabular-nums">{day.delivered}</p>
                <p className="text-[11px] text-muted-foreground">teslim</p>
                {day.planned > 0 && (
                  <p className="mt-1 text-[11px] text-primary tabular-nums">
                    {day.planned} planlı
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ============================================================
          ÇALIŞMALAR — dağıtımın yapıldığı yer
          ============================================================ */}
      <Section
        title="Bu haftanın çalışmaları"
        description="Her çalışmayı hangi gün yapacağını sen seçersin. Bu senin planın — resmi son teslim yukarıda."
      >
        {works.length === 0 ? (
          <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            Bu haftaya henüz çalışma yayınlanmadı.
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {works.map(work => (
              <WorkRow key={work.id} work={work} days={view.days} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function WorkRow({ work, days }: { work: HaftamWork; days: HaftamDay[] }) {
  const [isPending, startTransition] = useTransition()
  // İyimser değer: seçim anında listeyi beklemeden güncellenir, hata
  // olursa geri alınır. Aksi halde her seçim bir sayfa yenilemesi kadar
  // bekletirdi.
  const [planned, setPlanned] = useState(work.plannedForDate)

  function choose(next: string) {
    const value = next === '' ? null : next
    const previous = planned
    setPlanned(value)

    startTransition(async () => {
      const res = await setPlanDateAction(work.id, value)
      if (res?.error) {
        setPlanned(previous)
        toast.error(res.error)
        return
      }
      toast.success(value ? 'Planına eklendi.' : 'Plandan çıkarıldı.')
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm',
            (work.submitted || work.approved) && 'text-muted-foreground line-through'
          )}
        >
          {work.testTitle}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {work.bookTitle}
          {work.sectionTitle && ` · ${work.sectionTitle}`}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {work.approved && (
            <Badge variant="success">
              <CircleCheck className="size-3" /> Tamamlandı
            </Badge>
          )}
          {!work.approved && work.submitted && (
            <Badge variant="info">
              <Hourglass className="size-3" /> Onay bekliyor
            </Badge>
          )}
          {work.returned && <Badge variant="warning">Düzeltme istendi</Badge>}
          {/* "Sonradan eklendi" bir SUÇLAMA DEĞİL bilgi: öğrencinin
              kurduğu plan bu işi içermiyordu. */}
          {work.lateAdded && !planned && (
            <Badge variant="neutral">
              <Sparkles className="size-3" /> Hafta ortasında eklendi
            </Badge>
          )}
        </div>
      </div>

      {/* ONAYLANMIŞ ÇALIŞMA PLANLANMAZ: bitmiş bir işi güne koymak
          anlamsız. Onay bekleyen hâlâ planda kalabilir — öğretmen iade
          ederse öğrencinin o günü hâlâ geçerli. */}
      {work.approved ? (
        <span className="shrink-0 text-xs text-muted-foreground">Bitti</span>
      ) : (
        <NativeSelect
          className="w-auto min-w-32 shrink-0"
          value={planned ?? ''}
          disabled={isPending}
          aria-label={`${work.testTitle} için gün seç`}
          onChange={e => choose(e.target.value)}
        >
          <option value="">Planlanmadı</option>
          {days.map(day => (
            <option key={day.date} value={day.date}>
              {WEEKDAY_SHORT[day.weekday]} · {shortDate(day.date)}
            </option>
          ))}
        </NativeSelect>
      )}
    </li>
  )
}
