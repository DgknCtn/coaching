import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalShell, LegalHeading } from '@/components/marketing/legal-shell'
import { BRAND } from '@/lib/brand'
import { TRIAL_DAYS } from '@/lib/plans'

// İADE VE İPTAL KOŞULLARI — TASLAK.
//
// NEDEN YASAL ASGARİNİN ÜSTÜNDE: hizmet sözleşmelerinde cayma hakkı
// kanunen kullanılamıyor, yani hiç iade vermemek mevzuata uygun olurdu.
// Ama bu, ürünü ilk kez satın alan bir öğretmen için ciddi bir risk
// demek ve satın alma önündeki en büyük engel. 14 günlük koşulsuz iade,
// o engeli kaldırmanın maliyeti düşük yoludur — üstelik zaten 14 günlük
// ücretsiz deneme veriliyor, yani gerçekte kullanılma ihtimali düşük.
//
// UYARI: HUKUKİ İNCELEMEDEN GEÇMEMİŞTİR.

export const metadata: Metadata = {
  title: `İade ve İptal Koşulları · ${BRAND.name}`,
  description: 'Aboneliğinizi nasıl iptal edersiniz, hangi durumlarda iade alırsınız.',
}

export default function RefundPage() {
  return (
    <LegalShell title="İade ve İptal Koşulları" updatedAt="4 Eylül 2026">
      <p>
        Bu metin, {BRAND.name} aboneliklerinde iptal ve iade süreçlerini açıklar. Amaç
        hukuki bir kalkan değil, ne beklemeniz gerektiğini net söylemektir.
      </p>

      <LegalHeading>Önce deneyin, sonra ödeyin</LegalHeading>
      <p>
        Her yeni hesap {TRIAL_DAYS} gün boyunca ürünün tamamına ücretsiz erişir.
        Denemeye başlarken kart bilgilerinizi kaydedersiniz ama{' '}
        <strong className="text-foreground">deneme boyunca hiçbir tahsilat yapılmaz</strong> —
        ürünün işinize yarayıp yaramadığını ödeme yapmadan görürsünüz.
      </p>

      <LegalHeading>İptal</LegalHeading>
      <p>
        Aboneliğinizi <strong className="text-foreground">dilediğiniz zaman</strong>,
        gerekçe göstermeden, panelden tek adımda iptal edebilirsiniz. Bizi aramanız ya
        da e-posta yazmanız gerekmez.
      </p>
      <p>
        İptalde erişiminiz <strong className="text-foreground">hemen kesilmez</strong>:
        ödediğiniz dönemin sonuna kadar kullanmaya devam edersiniz. Verileriniz
        silinmez; daha sonra geri dönerseniz aynı verilerle devam edersiniz.
      </p>

      <LegalHeading>14 gün koşulsuz iade</LegalHeading>
      <p>
        Hizmet sözleşmelerinde cayma hakkı mevzuat gereği kullanılamamaktadır. Buna
        rağmen, ilk ödemenizden itibaren{' '}
        <strong className="text-foreground">14 gün içinde</strong> talep etmeniz hâlinde
        ücretinizi <strong className="text-foreground">koşulsuz iade ediyoruz</strong>.
        Gerekçe sormuyoruz.
      </p>
      <p>
        Talebinizi{' '}
        <a
          href={`mailto:${BRAND.contactEmail}?subject=${encodeURIComponent('İade talebi')}`}
          className="text-primary underline underline-offset-4"
        >
          {BRAND.contactEmail}
        </a>{' '}
        adresine yazmanız yeterli. İade, ödemeyi yaptığınız karta yapılır ve bankanıza
        bağlı olarak hesabınıza geçmesi genellikle birkaç iş günü sürer.
      </p>

      <LegalHeading>Yenileme ödemelerinde iade</LegalHeading>
      <p>
        14 günlük süre, <strong className="text-foreground">ilk ödemeniz</strong> için
        geçerlidir. Sonraki yenilemelerde kullanılmamış döneme ilişkin iade talebinizi
        yine değerlendiririz; yenileme tarihini kaçırdıysanız ve ürünü hiç
        kullanmadıysanız bize yazın.
      </p>
      <p>
        Yenilemeden önce hatırlatma göndeririz. Beklenmedik bir tahsilatla
        karşılaşırsanız bu bir hatadır ve düzeltiriz.
      </p>

      <LegalHeading>Deneme süresi biterken</LegalHeading>
      <p>
        Deneme süresinin sonunda tahsilat <strong className="text-foreground">otomatik</strong>{' '}
        yapılır. Ücret ödemek istemiyorsanız, süre dolmadan panelden tek adımda iptal
        etmeniz yeterli; iptal ettiğinizde hiçbir ücret alınmaz. Yenileme öncesinde
        e-posta ile hatırlatma göndeririz.
      </p>
      <p>
        Hatırlatmayı kaçırıp istemediğiniz bir tahsilatla karşılaştıysanız bize yazın —
        14 günlük koşulsuz iade hakkınız zaten bu durumu kapsıyor.
      </p>

      <LegalHeading>İade yapmadığımız durumlar</LegalHeading>
      <ul className="ml-5 list-disc space-y-2">
        <li>
          Kullanım koşullarının ihlali nedeniyle hesabın askıya alındığı durumlar.
        </li>
        <li>
          Aynı kişi ya da kurum tarafından tekrar eden iade talepleriyle ürünün
          ücretsiz kullanılmaya çalışılması.
        </li>
      </ul>

      <LegalHeading>Hizmet veremezsek</LegalHeading>
      <p>
        Hizmeti tamamen durdurmamız hâlinde, kullanılmamış döneme ilişkin bedeli talep
        beklemeden iade eder ve verilerinizi dışa aktarmanız için makul bir süre
        tanırız.
      </p>

      <p className="text-sm">
        İlgili diğer metinler:{' '}
        <Link href="/mesafeli-satis" className="text-primary underline underline-offset-4">
          Mesafeli Satış Sözleşmesi
        </Link>
        ,{' '}
        <Link href="/on-bilgilendirme" className="text-primary underline underline-offset-4">
          Ön Bilgilendirme Formu
        </Link>
        ,{' '}
        <Link href="/kosullar" className="text-primary underline underline-offset-4">
          Kullanım Koşulları
        </Link>
        .
      </p>
    </LegalShell>
  )
}
