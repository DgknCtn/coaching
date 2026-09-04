import Link from 'next/link'
import { AlertTriangle, Users } from 'lucide-react'
import { PLANS, evaluateQuota, trialDaysLeft, type WorkspaceUsage } from '@/lib/plans'
import { ProgressBar } from '@/components/shared/progress-bar'
import { cn } from '@/lib/utils'

// Kota ve deneme göstergesi (Faz 4).
//
// NEDEN GÖRÜNÜR OLMALI: limit veritabanı tetikleyicisiyle zorlanıyor
// (052). Kullanıcı sınıra ancak yeni öğrenci eklemeye çalıştığında ve bir
// HATA olarak çarparsa, bu kötü bir sürprizdir. Sayı önceden görünmeli.
//
// SESSİZ DURUMDA HİÇ ÇİZİLMEZ: sınırsız planda ve tavanın uzağındayken
// gösterge yer kaplamaz. Her zaman görünen bir kota çubuğu, ürünü
// kullanmayı bir sayaç izlemeye çevirir.

export function QuotaNotice({
  usage,
  className,
}: {
  usage: WorkspaceUsage
  className?: string
}) {
  const quota = evaluateQuota(usage)
  const daysLeft = trialDaysLeft(usage.trialEndsAt)
  const planName = PLANS[usage.plan]?.name ?? usage.plan

  // Deneme uyarısı son üç günde çıkar: 14 gün boyunca sayaç göstermek
  // ürünü denemeyi bir geri sayıma çevirir.
  const showTrial = usage.plan === 'trial' && daysLeft !== null && daysLeft <= 3
  const showQuota = quota.isNearLimit

  if (!showTrial && !showQuota) return null

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3',
        quota.atLimit || (showTrial && daysLeft === 0)
          ? 'border-destructive-border bg-destructive-subtle'
          : 'border-warning-border bg-warning-subtle',
        className
      )}
    >
      {showTrial && (
        <p
          className={cn(
            'flex items-start gap-2 text-sm',
            daysLeft === 0 ? 'text-destructive-foreground' : 'text-warning-foreground'
          )}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {daysLeft === 0 ? (
              <>Deneme süreniz bugün doluyor. Süre dolduğunda çalışma alanı kapanır.</>
            ) : (
              <>
                Deneme sürenizin bitmesine{' '}
                <span className="font-medium tabular-nums">{daysLeft} gün</span> kaldı.
              </>
            )}{' '}
            Verileriniz silinmez; bir plan seçtiğinizde kaldığınız yerden devam edersiniz.
          </span>
        </p>
      )}

      {showQuota && (
        <div className={cn(showTrial && 'mt-3 border-t border-current/15 pt-3')}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p
              className={cn(
                'flex items-center gap-2 text-sm',
                quota.atLimit ? 'text-destructive-foreground' : 'text-warning-foreground'
              )}
            >
              <Users className="size-4 shrink-0" />
              {quota.atLimit
                ? `${planName} planının öğrenci sınırına ulaştınız.`
                : `${planName} planında ${quota.remaining} öğrenci hakkınız kaldı.`}
            </p>
            <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {usage.activeStudents} / {usage.studentLimit}
            </p>
          </div>

          <ProgressBar
            className="mt-2"
            value={quota.usedPercentage ?? 0}
            label="Öğrenci kotası kullanımı"
            tone={quota.atLimit ? 'destructive' : 'warning'}
          />

          <p className="mt-2 text-xs text-muted-foreground">
            Arşivlenen öğrenciler kotadan düşer.{' '}
            <Link href="/#fiyatlar" className="underline underline-offset-2">
              Planları görüntüleyin
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}
