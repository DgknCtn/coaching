import Link from 'next/link'
import { ArrowRight, CalendarClock, CircleCheck, Hourglass, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ProgressRing, type RingTone } from '@/components/shared/progress-ring'
import { PACE_BAND_LABEL, type PaceBand } from '@/lib/weekly-flow'
import { cn } from '@/lib/utils'
import { APP_TIME_ZONE } from '@/lib/homework-status'

// "BU HAFTA" — Genel Bakış'ın BİRİNCİ ve tam genişlikteki bloğu (R7/02 §1).
//
// ============================================================
// NEDEN EN ÜSTTE VE NEDEN TAM GENİŞLİK
//
// Belgenin tespiti: *"Bu Hafta bilgisi ilk ve baskın blok değil."*
// Öğretmen bir öğrenciye girdiğinde ilk sorusu "bu hafta nasıl gidiyor?"
// — oysa ekran onu önce üç eşit ağırlıklı kartla karşılıyordu. Blok
// artık başlığın hemen altında ve yanında rakip yok.
//
// ============================================================
// VERİ DASHBOARD İLE AYNI KAYNAKTAN
//
// Sayılar `teacher_student_operation_view`'dan (080) geliyor — yani
// Dashboard'daki "Teslim" sütunuyla BİREBİR aynı satır. İkinci bir
// hesap yazılsaydı öğretmen listede bir sayı, öğrenciye girince başka
// bir sayı görürdü ve hangisinin doğru olduğunu bilmenin yolu olmazdı.
//
// ============================================================
// "KENDİ PLANI" BİLİNÇLİ OLARAK YOK
//
// Belgenin hedef ekranında "135/135 dağıtıldı" diye bir satır var ama
// verisi yok: öğrencinin haftalık yükü günlere dağıtması R7-05'in
// "sonraki adım" diye işaretlediği iş ve 077 `planned_for_date`
// sütununu bu yüzden açmadı. Uydurulmuş bir dağıtım sayısı,
// öğrencinin yapmadığı bir planı yapmış gibi gösterirdi.

export interface ThisWeekView {
  /** Aktif akış yoksa null — blok o zaman "hafta açılmamış" der. */
  flowId: string | null
  total: number
  submitted: number
  percent: number
  approvalPending: number
  /** Sıradaki temas (ISO) ve türü. */
  nextContactAt: string | null
  nextContactKind: 'ders' | 'kocluk' | null
  /** Öğrencinin son gönderimi (ISO). */
  lastSubmittedAt: string | null
  /** Teslim sessizliği cümlesi — lib/weekly-flow.ts üretir. */
  silence: { silent: boolean; phrase: string }
  pace: { startingPerDay: number; requiredPerDay: number; band: PaceBand } | null
}

function perDay(n: number): string {
  // Ondalık bir "çalışma" yoktur; yukarı yuvarlanır çünkü 19,2 çalışma
  // gerekiyorsa 19 yetmez.
  return `${Math.ceil(n)} çalışma/gün`
}

function timeLeft(ms: number): string {
  if (ms <= 0) return 'zamanı geldi'
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 24) return `${Math.max(1, hours)} saat kaldı`
  return `${Math.floor(hours / 24)} gün kaldı`
}

const BAND_VARIANT: Record<PaceBand, 'success' | 'warning' | 'destructive'> = {
  good: 'success',
  slightly_behind: 'warning',
  clearly_behind: 'warning',
  critical: 'destructive',
}

/** Halka rozetle AYNI bandı gösterir; iki ayrı eşik olmaz. */
const BAND_RING_TONE: Record<PaceBand, RingTone> = {
  good: 'success',
  slightly_behind: 'warning',
  clearly_behind: 'warning',
  critical: 'destructive',
}

export function ThisWeekCard({
  studentId,
  view,
  now,
}: {
  studentId: string
  view: ThisWeekView
  /** Sunucudan geçen an — istemcide ikinci bir saat okunmuyor. */
  now: Date
}) {
  const remaining = Math.max(0, view.total - view.submitted)
  const flowHref = `/teacher/students/${studentId}/haftalik-akis`

  if (!view.flowId) {
    return (
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Bu Hafta</h2>
          <Link
            href={flowHref}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Haftalık akışı aç <ArrowRight className="inline size-3.5" />
          </Link>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Açık haftalık akış yok. Hafta açılana kadar teslim oranı ve tempo
          hesaplanmaz.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-medium">Bu Hafta</h2>
          <p className="text-xs text-muted-foreground">Haftalık planın genel durumu</p>
        </div>
        <Link href={flowHref} className="text-sm text-muted-foreground hover:text-foreground">
          Haftalık akışı aç <ArrowRight className="inline size-3.5" />
        </Link>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-3">
        {/* 1 — TESLİM. Ölçüt öğrencinin gönderimi; öğretmen onayı
            ilerlemeyi geriye düşürmez (kabul #8). */}
        <div className="flex items-center gap-4">
          {/* HALKA ORANI BİR BAKIŞTA VERİR. Aynı sayılar metin olarak da
              duruyor: renk ve yay tek başına anlam taşımaz, halka
              `aria-hidden`. Tonu tempo bandından alıyor ki rozet ile
              halka aynı şeyi söylesin — iki ayrı eşik olsaydı halka
              yeşilken rozet "biraz geride" diyebilirdi. */}
          <ProgressRing
            value={view.percent}
            size="md"
            tone={view.pace ? BAND_RING_TONE[view.pace.band] : 'default'}
          />
          <div className="min-w-0">
            <p className="text-2xl font-semibold tabular-nums">
              {view.submitted}
              <span className="text-muted-foreground"> / {view.total}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              çalışma teslim edildi · {remaining} çalışma kaldı
            </p>
            {view.pace && (
              <Badge variant={BAND_VARIANT[view.pace.band]} className="mt-2">
                {PACE_BAND_LABEL[view.pace.band]}
              </Badge>
            )}
          </div>
        </div>

        {/* 2 — TEMAS VE TEMPO. Belgenin "başlangıç temposu / güncel
            gerekli tempo" ikilisi: ikisinin arası açıldıkça öğrenci
            geriye düşüyor demektir. */}
        <div className="space-y-1.5 text-sm">
          {view.nextContactAt ? (
            <div>
              <p className="flex items-center gap-1.5">
                <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="font-medium">
                  {new Date(view.nextContactAt).toLocaleString('tr-TR', {
                    // Sunucu UTC, tarayıcı kullanıcının dilimi: bölge
                    // yazılmazsa aynı görüşme iki ekranda iki saat gösterir.
                    timeZone: APP_TIME_ZONE,
                    weekday: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </p>
              <p className="pl-5.5 text-xs text-muted-foreground">
                {view.nextContactKind === 'kocluk' ? 'Koçluk görüşmesi' : 'Ders'} ·{' '}
                {timeLeft(new Date(view.nextContactAt).getTime() - now.getTime())}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sonraki temas planlanmadı</p>
          )}

          {view.pace ? (
            <dl className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <dt className="text-xs text-muted-foreground">Başlangıç temposu</dt>
                <dd className="tabular-nums">{perDay(view.pace.startingPerDay)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Güncel gerekli tempo</dt>
                <dd className="tabular-nums">{perDay(view.pace.requiredPerDay)}</dd>
              </div>
            </dl>
          ) : (
            <p className="pt-1 text-xs text-muted-foreground">
              Bu haftaya henüz çalışma yayınlanmadı; tempo hesaplanmıyor.
            </p>
          )}
        </div>

        {/* 3 — HAREKET VE KUYRUK. */}
        <div className="space-y-1.5 text-sm">
          <p
            className={cn(
              'flex items-start gap-1.5',
              view.silence.silent && 'text-warning-foreground'
            )}
          >
            {view.silence.silent ? (
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            {view.silence.phrase}
          </p>

          {view.approvalPending > 0 ? (
            <Link
              href={`/teacher/tasks?filter=approval&student=${studentId}`}
              className="flex items-start gap-1.5 hover:underline"
            >
              <Hourglass className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              {view.approvalPending} çalışma onay bekliyor
            </Link>
          ) : (
            <p className="flex items-start gap-1.5 text-muted-foreground">
              <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden />
              Onay kuyruğu boş
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
