'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Users,
  CalendarRange,
  ShoppingCart,
  Phone,
  Check,
  Lock,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  quote,
  isSelfService,
  formatKurus,
  formatKurusShort,
  MONTH_OPTIONS,
  MAX_SELF_SERVICE_STUDENTS,
  type Quote,
} from '@/lib/billing/pricing'
import { BRAND, contactMailto } from '@/lib/brand'
import { PLAN_INCLUDED } from '@/lib/plans'
import { cn } from '@/lib/utils'

// LİSANS YAPILANDIRICISI.
//
// ============================================================
// TASARIM: HESAP CANLI, TUTAR SUNUCUDAN
//
// Kullanıcı öğrenci sayısını ya da süreyi değiştirdikçe tutar ANINDA
// güncellenir — her tuş vuruşunda sunucuya gitmek kullanılabilir bir
// deneyim değil. Ama ÖDENECEK tutarı bu bileşen belirlemez: satın alma
// isteği yalnız (öğrenci sayısı, ay) gönderir, fiyatı veritabanı
// hesaplar. Buradaki sayı bir GÖSTERİM; otorite sunucuda.
//
// İkisinin aynı sonucu ürettiği tests/pricing-sql-parity.test.ts ile
// kilitli.
//
// İNDİRİM GÖRÜNÜR OLMALI: "öğrenci sayısı ve süre arttıkça öğrenci
// başına maliyet düşer" cümlesini yazmak yetmez; kullanıcı sayıyı
// değiştirince birim fiyatın düştüğünü GÖRMELİ. İkna eden şey cümle
// değil, rakamın hareketi.
// ============================================================

interface LicenseConfiguratorProps {
  /** Satın almayı başlatır; sunucu tarafında fiyat yeniden hesaplanır. */
  onPurchase: (studentCount: number, months: number) => Promise<{ error?: string; paymentPageUrl?: string }>
  /** Mevcut aktif öğrenci sayısı — varsayılan seçimi anlamlı kılar. */
  currentStudents?: number
  /** Satın alma düğmesinin metni. */
  ctaLabel?: string
}

export function LicenseConfigurator({
  onPurchase,
  currentStudents = 0,
  ctaLabel = 'Güvenli Ödemeye Geç',
}: LicenseConfiguratorProps) {
  // Varsayılan: mevcut öğrenci sayısı (en az 1). Kullanıcının bugün
  // kaç öğrencisi varsa muhtemelen o kadarına lisans alacak.
  const [studentsInput, setStudentsInput] = useState(String(Math.max(1, currentStudents)))
  const [months, setMonths] = useState(1)
  const [pending, startTransition] = useTransition()

  const studentCount = Number.parseInt(studentsInput, 10)
  const valid = Number.isInteger(studentCount) && studentCount >= 1
  const selfService = valid && isSelfService(studentCount)

  const q: Quote | null = useMemo(() => {
    if (!valid || !selfService) return null
    return quote(studentCount, months)
  }, [valid, selfService, studentCount, months])

  function buy() {
    if (!q) return
    startTransition(async () => {
      const res = await onPurchase(q.studentCount, q.months)
      if (res.error) {
        toast.error(res.error)
        return
      }
      if (res.paymentPageUrl) window.location.href = res.paymentPageUrl
    })
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="student-count" className="flex items-center gap-1.5">
            <Users className="size-3.5 text-muted-foreground" />
            Öğrenci sayısı
          </Label>
          <Input
            id="student-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_SELF_SERVICE_STUDENTS}
            value={studentsInput}
            onChange={(e) => setStudentsInput(e.target.value)}
            aria-describedby="student-count-hint"
          />
          <p id="student-count-hint" className="text-xs text-muted-foreground">
            Plan süresince aynı anda takip edebileceğiniz aktif öğrenci sayısı.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="months" className="flex items-center gap-1.5">
            <CalendarRange className="size-3.5 text-muted-foreground" />
            Kullanım süresi
          </Label>
          {/* Yerel select: 12 seçenek için özel bir bileşen gereksiz ve
              mobilde yerel seçici her zaman daha kullanışlı. */}
          <select
            id="months"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} Ay
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Süre uzadıkça öğrenci başına maliyet düşer.
          </p>
        </div>
      </div>

      {!valid ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Devam etmek için geçerli bir öğrenci sayısı girin.
        </p>
      ) : !selfService ? (
        // 500 üstü: bu ölçekte fiyat pazarlığa tabi ve sözleşme gerekiyor.
        // Uydurma bir rakam göstermek yerine görüşmeye yönlendiriyoruz.
        <div className="mt-6 rounded-md border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium">
            {MAX_SELF_SERVICE_STUDENTS} üzeri öğrenci için özel fiyatlandırma
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Bu ölçekte kurumsal koşullar ve sözleşme gerekiyor. Size uygun fiyatı
            birlikte belirleyelim.
          </p>
          <a
            href={contactMailto(`${BRAND.name} — kurumsal fiyat talebi`)}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4"
          >
            <Phone className="size-3.5" />
            İletişime geç
          </a>
        </div>
      ) : (
        q && (
          <>
            <div className="mt-6 border-t pt-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-3xl font-semibold tracking-tight tabular-nums">
                    {formatKurus(q.grossKurus)}
                  </p>
                  {/* RAKAM NEYİN KARŞILIĞI: toplam tutar en büyük sayı
                      ama neyin bedeli olduğu yazmıyordu. Kullanıcı
                      seçtiği yapılandırmayı yukarı kaydırıp tekrar
                      kontrol etmek zorunda kalıyordu. */}
                  <p className="mt-1 text-sm font-medium">
                    {q.studentCount} öğrenci · {q.months} ay
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    KDV dahil · tek çekim
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums">
                    {formatKurus(q.perStudentPerMonthKurus)}
                  </p>
                  <p className="text-xs text-muted-foreground">öğrenci / ay</p>
                </div>
              </div>

              {/* Kazanılan indirim: yalnız gerçekten indirim varken
                  gösteriliyor. "%0 indirim" yazan bir rozet, indirimin
                  kendisini değersizleştirir. */}
              {q.totalDiscountPercent > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-sm bg-success-subtle px-2 py-0.5 text-xs font-medium text-success-foreground">
                    %{q.totalDiscountPercent} avantaj
                  </span>
                  <span className="text-muted-foreground">
                    Liste fiyatı{' '}
                    <span className="line-through tabular-nums">
                      {formatKurusShort(q.listGrossKurus)}
                    </span>{' '}
                    yerine{' '}
                    <strong className="font-medium text-foreground tabular-nums">
                      {formatKurusShort(q.grossKurus)}
                    </strong>
                  </span>
                </div>
              )}

              {/* İndirimin NEREDEN geldiği ayrı ayrı: kullanıcı hangi
                  kaldıracı çevirirse ne kazanacağını görsün. */}
              {(q.durationDiscountPercent > 0 || q.volumeDiscountPercent > 0) && (
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {q.durationDiscountPercent > 0 && (
                    <li>
                      {q.months} aylık kullanım: %{q.durationDiscountPercent} indirim
                    </li>
                  )}
                  {q.volumeDiscountPercent > 0 && (
                    <li>
                      {q.studentCount} öğrenci: %{q.volumeDiscountPercent} indirim
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/* DAHİL OLANLAR fiyatın hemen yanında: "bu parayı neden
                vereyim" sorusu karar anında sorulur, SSS'de değil.
                Metin pricing-section.tsx'teki mevcut listeden alındı —
                burada yeni vaat üretilmiyor. */}
            <div className="mt-5 rounded-lg border bg-muted/30 p-4">
              <p className="text-sm font-medium">Bu planla</p>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {PLAN_INCLUDED.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success-foreground" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Özellik kısıtlaması yok. Yalnız öğrenci sayısı ve süre değişir.
              </p>
            </div>

            {/* Kart kaydedilip her ay çekilmesi, bu üründe olmayan ama
                en çok korkulan şey. Onay metninde zaten yazıyordu —
                ama düğmenin ALTINDA, yani karar verildikten sonra. */}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Lock className="size-3.5 shrink-0 text-success-foreground" />
                Tek seferlik ödeme
              </span>
              <span className="flex items-center gap-1.5">
                <RotateCcw className="size-3.5 shrink-0 text-success-foreground" />
                Otomatik yenileme yok
              </span>
            </div>

            <Button
              type="button"
              size="lg"
              className={cn('mt-4 w-full gap-2')}
              disabled={pending}
              onClick={buy}
            >
              <ShoppingCart className="size-4" />
              {pending ? 'Ödeme sayfası açılıyor…' : ctaLabel}
            </Button>

            <p className="mt-3 text-center text-xs text-muted-foreground">
              Ödeme tek çekimdir ve <strong>otomatik yenilenmez</strong>. Süre bitmeden
              size hatırlatırız. Devam ederek{' '}
              <Link href="/mesafeli-satis" className="underline underline-offset-2">
                mesafeli satış sözleşmesini
              </Link>{' '}
              ve{' '}
              <Link href="/on-bilgilendirme" className="underline underline-offset-2">
                ön bilgilendirme formunu
              </Link>{' '}
              kabul edersiniz.
            </p>
          </>
        )
      )}
    </div>
  )
}
