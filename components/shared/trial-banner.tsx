import Link from 'next/link'
import { CreditCard, AlertTriangle } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { trialDaysLeft } from '@/lib/plans'

// DENEME ŞERİDİ — henüz lisans almamış kullanıcılar için.
//
// ============================================================
// NEDEN SERT ENGEL YOK
//
// 7 günlük deneme ücretsiz ve kart istemiyor. Ama süre gerçekten doluyor
// (058) ve dolduğunda çalışma alanı kapanıyor. Habersiz kapanmak,
// kullanıcının ürünü değil bizi suçlaması demek — otomatik tahsilat
// olmadığı için hatırlatmanın tek yolu bu şerit.
//
// TON SÜREYE GÖRE SERTLEŞİYOR: son üç günde uyarı rengine geçiyor.
// Aynı tonda ısrar eden bir şerit, ikinci günden sonra görünmez olur.
// ============================================================

interface TrialBannerProps {
  /** `workspaces.trial_ends_at`. Null ise deneme yok ya da bitmiş. */
  trialEndsAt: string | null
  /** Aktif lisans varsa şerit hiç gösterilmez. */
  hasLicense: boolean
}

export function TrialBanner({ trialEndsAt, hasLicense }: TrialBannerProps) {
  // Lisans alınmışsa söylenecek bir şey yok. Ödeme yapmış kullanıcıya
  // ödeme hatırlatmak, en kolay güven kaybettirme yollarından biri.
  if (hasLicense) return null

  const daysLeft = trialDaysLeft(trialEndsAt)
  if (daysLeft == null) return null

  const urgent = daysLeft <= 3
  const expired = daysLeft <= 0

  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        urgent
          ? 'border-warning-border bg-warning-subtle'
          : 'border-border bg-muted/40'
      )}
      role="status"
    >
      <div className="flex gap-3">
        {urgent ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
        ) : (
          <CreditCard className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="text-sm">
          <p className={cn('font-medium', urgent && 'text-warning-foreground')}>
            {expired
              ? 'Deneme süreniz doldu'
              : daysLeft === 1
                ? 'Deneme süreniz yarın doluyor'
                : `Deneme süreniz ${daysLeft} gün sonra doluyor`}
          </p>
          <p className={cn('mt-0.5', urgent ? 'text-warning-foreground' : 'text-muted-foreground')}>
            {expired
              ? 'Verileriniz duruyor. Bir plan aldığınızda kaldığınız yerden devam edersiniz.'
              : 'Süre dolmadan planınızı alın, kesinti yaşamayın. Öğrenci sayınızı ve süreyi kendiniz seçersiniz.'}
          </p>
        </div>
      </div>

      <Link
        href="/teacher/ayarlar/abonelik"
        className={cn(
          buttonVariants({ size: 'sm', variant: urgent ? 'default' : 'outline' }),
          'shrink-0'
        )}
      >
        Plan al
      </Link>
    </div>
  )
}
