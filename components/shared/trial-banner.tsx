import Link from 'next/link'
import { CreditCard, AlertTriangle } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { trialDaysLeft } from '@/lib/plans'

// DENEME ŞERİDİ — kart adımını atlayanlar için.
//
// ============================================================
// NEDEN SERT ENGEL YOK
//
// Kart adımı "sonra hatırlat" ile geçilebiliyor. Kapıyı kilitlemek,
// kaydolmuş bir kullanıcıyı ürünü hiç görmeden kaybetmek olurdu. Ama
// atlayan kullanıcı da sessiz bırakılmamalı: deneme gerçekten doluyor
// (057) ve dolduğunda çalışma alanı kapanıyor. Habersiz kapanmak,
// kullanıcının ürünü değil bizi suçlaması demek.
//
// TON SÜREYE GÖRE SERTLEŞİYOR: son üç günde uyarı rengine geçiyor.
// Aynı tonda ısrar eden bir şerit, ikinci günden sonra görünmez olur.
// ============================================================

interface TrialBannerProps {
  /** `workspaces.trial_ends_at`. Null ise deneme yok ya da bitmiş. */
  trialEndsAt: string | null
  /** Abonelik kurulduysa şerit hiç gösterilmez. */
  hasSubscription: boolean
}

export function TrialBanner({ trialEndsAt, hasSubscription }: TrialBannerProps) {
  // Kart verilmişse söylenecek bir şey yok. Ödeme yapmış kullanıcıya
  // ödeme hatırlatmak, en kolay güven kaybettirme yollarından biri.
  if (hasSubscription) return null

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
              ? 'Verileriniz duruyor. Bir plan seçtiğinizde kaldığınız yerden devam edersiniz.'
              : 'Kartınızı kaydedin, süre dolduğunda kesinti yaşamayın. Deneme boyunca tahsilat yapılmaz.'}
          </p>
        </div>
      </div>

      <Link
        href="/kurulum/odeme"
        className={cn(
          buttonVariants({ size: 'sm', variant: urgent ? 'default' : 'outline' }),
          'shrink-0'
        )}
      >
        {expired ? 'Plan seç' : 'Kartı kaydet'}
      </Link>
    </div>
  )
}
