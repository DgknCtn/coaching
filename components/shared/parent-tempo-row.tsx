import { calculatePlanTempo } from '@/lib/plan-pace'
import { formatTempo, formatUnitCount, type UnitMode } from '@/lib/unit-labels'
import { ProgressBar } from '@/components/shared/progress-bar'
import { cn } from '@/lib/utils'

// Velinin gördüğü plan/tempo satırı.
//
// NEDEN AYRI BİR BİLEŞEN: veli bugüne kadar öğretmenle BİREBİR aynı
// PlanTempoCard'ı görüyordu — başlangıç tempsu, gerekli tempo, kalan hafta,
// hedef tarih, yüzde. R6 bekleme listesinde "veli panelindeki tempo
// göstergelerinin sadeleştirilmesi" maddesi tam olarak bunu bekliyordu.
//
// Veli bu sayılarla bir KARAR VERMİYOR: ödev atamıyor, hedef değiştirmiyor.
// Onun sorusu tek: "iyi gidiyor mu, gitmiyorsa ne kadar geride?" Bu yüzden
// çıktı tek cümleye iner ve kart yığını yerine kitap başına bir satır olur.
//
// HESAP AYNIDIR: calculatePlanTempo. Veliye farklı bir matematik
// gösterilmiyor, aynı sonucun daha az teknik anlatımı gösteriliyor.

type Tone = 'ok' | 'warn' | 'done'

const TONE_STYLE: Record<Tone, string> = {
  done: 'text-success-foreground',
  ok: 'text-muted-foreground',
  warn: 'text-warning-foreground',
}

export function ParentTempoRow({
  bookTitle,
  startDate,
  targetEndDate,
  totalUnits,
  completedUnits,
  trackingMode,
}: {
  bookTitle: string
  startDate: string | null
  targetEndDate: string | null
  totalUnits: number
  completedUnits: number
  trackingMode?: UnitMode
}) {
  const tempo = calculatePlanTempo({
    startDate,
    targetEndDate,
    totalUnits,
    completedUnits,
    trackingMode,
  })

  let sentence: string
  let tone: Tone = 'ok'

  if (tempo.remainingUnits === 0) {
    sentence = 'Bu kaynak tamamlandı.'
    tone = 'done'
  } else if (!targetEndDate) {
    // Hedef tarihi yoksa tempo hesaplanamaz; uydurulmuş bir "gidişat"
    // göstermektense durumu olduğu gibi söylemek doğru.
    sentence = `${formatUnitCount(tempo.remainingUnits, trackingMode)} kaldı. Hedef tarihi belirlenmemiş.`
  } else if (tempo.isTargetReached) {
    sentence = `Hedef tarihi doldu, ${formatUnitCount(tempo.remainingUnits, trackingMode)} kaldı.`
    tone = 'warn'
  } else if (
    tempo.requiredPacePerWeek !== null &&
    tempo.initialPacePerWeek !== null &&
    // Gereken tempo başlangıçtakinin belirgin üstüne çıktıysa geri kalınmış
    // demektir. %20'lik pay küçük dalgalanmayı "geride" saymamak için.
    tempo.requiredPacePerWeek > tempo.initialPacePerWeek * 1.2
  ) {
    // formatTempo zaten "/hafta" ekliyor; cümlede ikinci kez yazılmaz.
    sentence = `Hedefe yetişmek için ${formatTempo(tempo.requiredPacePerWeek, trackingMode)} gerekiyor.`
    tone = 'warn'
  } else {
    sentence = `Hedefe göre iyi gidiyor. ${formatTempo(tempo.requiredPacePerWeek, trackingMode)} yeterli.`
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="truncate text-sm font-medium">{bookTitle}</p>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {completedUnits}/{totalUnits} · %{tempo.completionPercentage}
        </p>
      </div>

      <ProgressBar
        className="mt-2"
        value={tempo.completionPercentage}
        label={`${bookTitle} ilerlemesi`}
      />

      {/* Renk tek başına anlam taşımaz: cümlenin kendisi durumu söylüyor. */}
      <p className={cn('mt-1.5 text-xs', TONE_STYLE[tone])}>{sentence}</p>
    </div>
  )
}
