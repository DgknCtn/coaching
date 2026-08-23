import { BRAND, contactMailto } from '@/lib/brand'
import { SectionHeading } from './section-heading'

// SSS — satın alma kararının önündeki gerçek soruları karşılar.
// Cevaplar ürünün BUGÜN yaptığı işe göre yazıldı; söz verilen ama
// yapılmayan bir şey yok.

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Öğrenci ve velilerim de ücret ödeyecek mi?',
    a: 'Hayır. Yalnızca öğretmen tarafı ücretlendirilir. Öğrenci ve veli hesapları sınırsız ve ücretsizdir; davet linkiyle katılırlar.',
  },
  {
    q: 'Elimdeki Excel dosyalarını aktarabilir miyim?',
    a: 'Şu an otomatik içe aktarma yok. Kitapları bir kez sisteme eklersiniz: bölüm adı ve test sayısı (ya da sayfa aralığı) girmek yeterli. Kitap havuzunuzu istediğiniz zaman CSV veya JSON olarak dışa aktarıp yedekleyebilirsiniz.',
  },
  {
    q: 'Sayfa bazlı kitapları nasıl takip ediyor?',
    a: 'Bölümü "Üçgenler, sf. 1-56" gibi tanımlarsınız. Ödevde birden fazla aralık verebilirsiniz (sf. 1-36 ve 42-48). Sistem benzersiz sayfa üzerinden ilerlemeyi hesaplar, kalan aralıkları kendisi çıkarır ve aynı sayfa iki kez sayılmaz.',
  },
  {
    q: 'Ödevi öğrenciye nasıl iletiyorum?',
    a: 'Planı yayınladığınızda öğrencinin panelinde görünür. Ayrıca "Ödev metnini kopyala" ile test, sayfa ve video görevlerini tek bir mesaja sıkıştırıp WhatsApp\'tan gönderebilirsiniz.',
  },
  {
    q: 'Öğrenci "yaptım" derse otomatik tamamlanıyor mu?',
    a: 'Hayır. Öğrenci tamamladığını işaretler, ilerleme ancak siz onayladıktan sonra resmî kayda geçer. Yüzdeler yalnızca öğretmen onaylı çalışmalardan hesaplanır.',
  },
  {
    q: 'Verilerim güvende mi?',
    a: 'Her öğretmenin çalışma alanı veritabanı düzeyinde birbirinden yalıtılmıştır; kimse başkasının verisini göremez. Öğrenci yalnız kendi verisini, veli yalnız bağlı olduğu çocuğunun verisini görür.',
  },
  {
    q: 'Ücretsiz planda 10 öğrenciyi aşarsam ne olur?',
    a: 'Sizinle iletişime geçeriz; verileriniz silinmez. Planlar arası geçiş kayıp yaşatmadan yapılır.',
  },
]

export function FaqSection() {
  return (
    <section id="sss" className="scroll-mt-16 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-3xl">
        <SectionHeading eyebrow="SSS" title="Sık sorulanlar" />

        <div className="mt-12 divide-y rounded-lg border bg-card">
          {FAQS.map((faq) => (
            <details
              key={faq.q}
              className="group px-5 py-4 transition-colors hover:bg-muted/40 open:bg-muted/20"
            >
              <summary className="cursor-pointer list-none text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="flex items-start justify-between gap-4">
                  {faq.q}
                  <span
                    aria-hidden
                    className="mt-0.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
            </details>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Başka bir sorunuz mu var?{' '}
          <a
            href={contactMailto(`${BRAND.name} hakkında soru`)}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Bize yazın
          </a>
          .
        </p>
      </div>
    </section>
  )
}
