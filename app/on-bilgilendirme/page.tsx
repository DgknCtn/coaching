import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalShell, LegalHeading } from '@/components/marketing/legal-shell'
import { BRAND } from '@/lib/brand'
import { PLANS, TRIAL_DAYS } from '@/lib/plans'
import { PLAN_PRICING, ENABLED_INSTALLMENTS, formatKurus, VAT_RATE } from '@/lib/billing/pricing'

// ÖN BİLGİLENDİRME FORMU — TASLAK.
//
// ZORUNLU: Mesafeli Sözleşmeler Yönetmeliği, satıştan ÖNCE tüketiciye
// belirli bilgilerin verilmesini şart koşuyor. Bu form o bilgileri
// taşır ve mesafeli satış sözleşmesinden AYRI bir belgedir — ikisini
// tek sayfada birleştirmek yaygın ama yönetmeliğe uygun değil.
//
// UYARI: teknik olarak doğru (fiyatlar ve süreler koddan okunuyor) ama
// HUKUKİ İNCELEMEDEN GEÇMEMİŞTİR. Satıcı kimlik bilgileri şirket
// kurulduğunda doldurulmalı.
//
// SATICI BİLGİLERİ EKSİK: şirket henüz kurulmadığı için unvan, adres,
// vergi dairesi ve MERSİS alanları yer tutucu. BU HÂLİYLE SATIŞA
// AÇILMAMALIDIR — eksik satıcı bilgisi, sözleşmeyi tüketici lehine
// sakatlar.

export const metadata: Metadata = {
  title: `Ön Bilgilendirme Formu · ${BRAND.name}`,
  description: 'Satın alma öncesi bilinmesi gereken bilgiler: hizmet, fiyat, ödeme ve cayma hakkı.',
}

export default function PreliminaryInfoPage() {
  return (
    <LegalShell title="Ön Bilgilendirme Formu" updatedAt="4 Eylül 2026">
      <p>
        Bu form, Mesafeli Sözleşmeler Yönetmeliği uyarınca, satın alma işleminden önce
        bilmeniz gereken bilgileri içerir.
      </p>

      <LegalHeading>Satıcı bilgileri</LegalHeading>
      <div className="rounded-md border border-warning-border bg-warning-subtle px-4 py-3 text-sm text-warning-foreground">
        Bu alan, ticari faaliyet başlamadan önce gerçek unvan, adres, vergi dairesi,
        vergi numarası ve MERSİS bilgileriyle doldurulacaktır. Alan doldurulmadan
        ödeme alınmamalıdır.
      </div>
      <ul className="ml-5 list-disc space-y-2">
        <li>Unvan: —</li>
        <li>Adres: —</li>
        <li>Vergi dairesi / numarası: —</li>
        <li>
          E-posta:{' '}
          <a
            href={`mailto:${BRAND.contactEmail}`}
            className="text-primary underline underline-offset-4"
          >
            {BRAND.contactEmail}
          </a>
        </li>
      </ul>

      <LegalHeading>Hizmetin niteliği</LegalHeading>
      <p>
        {BRAND.name}, internet üzerinden sunulan bir yazılım hizmetidir (SaaS). Fiziksel
        bir ürün teslimatı yoktur; hizmet, ödeme onaylandığı anda kullanıma açılır.
        Hizmet bir eğitim kurumu faaliyeti değildir ve akademik sonuç garantisi vermez.
      </p>

      <LegalHeading>Fiyatlar</LegalHeading>
      <p>
        Aşağıdaki tutarlar <strong className="text-foreground">KDV dahildir</strong> (%
        {Math.round(VAT_RATE * 100)}). Fiyatlara ayrıca kargo veya teslimat bedeli
        eklenmez.
      </p>
      <ul className="ml-5 list-disc space-y-2">
        <li>
          <strong className="text-foreground">{PLANS.starter.name}</strong> —{' '}
          {formatKurus(PLAN_PRICING.starter.monthlyKurus)} / ay veya{' '}
          {formatKurus(PLAN_PRICING.starter.yearlyKurus)} / yıl ·{' '}
          {PLANS.starter.studentLimit} aktif öğrenciye kadar
        </li>
        <li>
          <strong className="text-foreground">{PLANS.coach.name}</strong> —{' '}
          {formatKurus(PLAN_PRICING.coach.monthlyKurus)} / ay veya{' '}
          {formatKurus(PLAN_PRICING.coach.yearlyKurus)} / yıl ·{' '}
          {PLANS.coach.studentLimit} aktif öğrenciye kadar
        </li>
        <li>
          <strong className="text-foreground">{PLANS.institution.name}</strong> — öğrenci
          sınırı yok, fiyat görüşmeye tabidir.
        </li>
      </ul>

      <LegalHeading>Ödeme ve taksit</LegalHeading>
      <p>
        Ödeme, kredi veya banka kartı ile ödeme kuruluşunun güvenli sayfası üzerinden
        alınır. Kart bilgileriniz {BRAND.name} sistemlerine iletilmez ve saklanmaz.
      </p>
      <p>
        <strong className="text-foreground">Taksit yalnız yıllık pakette</strong>{' '}
        kullanılabilir ({ENABLED_INSTALLMENTS.filter(n => n > 1).join(', ')} taksit).
        Aylık abonelikte taksit yapılamaz; tutar her ay tek seferde tahsil edilir.
        Taksitli işlemlerde bankanızın uygulayabileceği vade farkı bu tutarlara dahil
        değildir.
      </p>

      <LegalHeading>Abonelik süresi ve yenileme</LegalHeading>
      <p>
        Yeni hesaplar {TRIAL_DAYS} günlük ücretsiz deneme ile başlar; deneme için ödeme
        bilgisi istenmez. Aylık abonelik her ay, yıllık paket her yıl yenilenir.
        Aboneliğinizi dilediğiniz zaman panelden iptal edebilirsiniz; iptalde erişiminiz
        ödediğiniz dönemin sonuna kadar devam eder.
      </p>

      <LegalHeading>Cayma hakkı</LegalHeading>
      <p>
        Mesafeli Sözleşmeler Yönetmeliği&apos;nin 15. maddesi uyarınca, hizmetin ifasına
        tüketicinin onayı ile başlanan hizmet sözleşmelerinde cayma hakkı
        kullanılamamaktadır. Buna rağmen{' '}
        <Link href="/iade" className="text-primary underline underline-offset-4">
          iade koşullarımız
        </Link>{' '}
        yönetmeliğin zorunlu kıldığından daha geniş bir iade imkânı tanır.
      </p>

      <LegalHeading>Şikâyet ve uyuşmazlık</LegalHeading>
      <p>
        Talepleriniz için önce{' '}
        <a
          href={`mailto:${BRAND.contactEmail}`}
          className="text-primary underline underline-offset-4"
        >
          {BRAND.contactEmail}
        </a>{' '}
        adresine yazabilirsiniz. Uyuşmazlık hâlinde, Ticaret Bakanlığı&apos;nca her yıl
        belirlenen parasal sınırlar çerçevesinde tüketicinin yerleşim yerindeki Tüketici
        Hakem Heyetleri ve Tüketici Mahkemeleri yetkilidir.
      </p>
    </LegalShell>
  )
}
