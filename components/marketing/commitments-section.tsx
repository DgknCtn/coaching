import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// TAAHHÜTLER + DEMO — dürüst sosyal kanıt.
//
// ============================================================
// NEDEN REFERANS/LOGO/KULLANICI SAYISI YOK
//
// Ürün henüz satılmadı. "500+ koç kullanıyor" yazmak en kolay dönüşüm
// hilesi ve ilk müşteride fark edildiğinde geri dönüşü olmayan bir güven
// kaybı. `stats-bar.tsx` bu kararı zaten bir kez vermişti; burada da
// aynısı geçerli.
//
// Yerine iki gerçek kanıt kullanılıyor:
//   1. TAAHHÜTLER — hepsi bugün koddan doğrulanabilir cümleler.
//   2. DEMO — kayıt olmadan, üç rolün gerçek arayüzü. Bir vaat değil,
//      ürünün kendisi. Kart isteyen bir akışta en güçlü ikna aracı bu:
//      "önce gör, sonra kaydol" diyebilmek.
//
// Bu bölüm fiyatlandırmadan HEMEN ÖNCE duruyor — okuyucu parayı
// konuşmadan hemen önce ürünü kendi gözüyle görebilsin diye.
//
// Bölüm ritmini de kırıyor: sayfadaki diğer bölümler "başlık + kart
// ızgarası" kalıbında; bu iki sütunlu ve farklı zeminli.
// ============================================================

const COMMITMENTS = [
  {
    title: 'Uydurma rakam yok',
    body: 'Bu sayfada kullanıcı sayısı, memnuniyet oranı ya da referans göremezsiniz — çünkü ürün yeni. Gördüğünüz her şey bugün çalışan özellikler.',
  },
  {
    title: 'İlerlemeyi siz onaylarsınız',
    body: 'Öğrenci "yaptım" dediğinde yüzde değişmez. Kayda geçen tek şey sizin onayladığınızdır; rakamlar bu yüzden gerçeği gösterir.',
  },
  {
    title: 'Veriniz size ait',
    body: 'Her çalışma alanı veritabanı düzeyinde yalıtılmıştır. Verinizi dışa aktarabilir, silinmesini talep edebilirsiniz; reklam için kullanılmaz, satılmaz.',
  },
  {
    title: 'İptal, kayıt kadar kolay',
    body: 'Tek tıkla, gerekçe sorulmadan. Erişiminiz ödediğiniz dönemin sonuna kadar sürer, veriniz silinmez.',
  },
]

export function CommitmentsSection() {
  return (
    <section className="border-y bg-background px-6 py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">
            Söz veriyoruz
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Yeni bir ürüne güvenmek zor. Kolaylaştıralım.
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Kayıt olmadan, kart vermeden, üç rolün de gerçek arayüzünü örnek verilerle
            gezebilirsiniz. Beğenirseniz denemeye başlarsınız.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/demo" className={buttonVariants({ size: 'lg' })}>
              Demoyu aç
              <ArrowRight />
            </Link>
            <Link
              href="/register"
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              Ücretsiz Dene
            </Link>
          </div>
        </div>

        <dl className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
          {COMMITMENTS.map((item) => (
            <div key={item.title}>
              {/* Numara ya da ikon yok: bunlar bir sıra ya da süreç değil,
                  eşit ağırlıkta dört taahhüt. Numaralandırmak olmayan bir
                  hiyerarşi uydururdu. */}
              <dt className={cn('text-sm font-semibold')}>{item.title}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {item.body}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
