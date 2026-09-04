import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalShell, LegalHeading } from '@/components/marketing/legal-shell'
import { BRAND } from '@/lib/brand'
import { TRIAL_DAYS } from '@/lib/plans'
import { VAT_RATE } from '@/lib/billing/pricing'

// MESAFELİ SATIŞ SÖZLEŞMESİ — TASLAK.
//
// ZORUNLU: internet üzerinden tüketiciye yapılan her satışta bulunmak
// zorunda. Ön bilgilendirme formundan AYRI bir belgedir; ikisini tek
// sayfada birleştirmek yaygın ama yönetmeliğe uygun değil.
//
// UYARI: HUKUKİ İNCELEMEDEN GEÇMEMİŞTİR. Satıcı kimlik bilgileri şirket
// kurulduğunda doldurulmalı; eksik satıcı bilgisi sözleşmeyi tüketici
// lehine sakatlar. BU HÂLİYLE SATIŞA AÇILMAMALIDIR.

export const metadata: Metadata = {
  title: `Mesafeli Satış Sözleşmesi · ${BRAND.name}`,
  description: 'İnternet üzerinden yapılan abonelik satışına ilişkin sözleşme koşulları.',
}

export default function DistanceSalesPage() {
  return (
    <LegalShell title="Mesafeli Satış Sözleşmesi" updatedAt="4 Eylül 2026">
      <p>
        Bu sözleşme, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli
        Sözleşmeler Yönetmeliği uyarınca, aşağıda bilgileri bulunan SATICI ile ALICI
        arasında elektronik ortamda kurulur.
      </p>

      <LegalHeading>1. Taraflar</LegalHeading>
      <div className="rounded-md border border-warning-border bg-warning-subtle px-4 py-3 text-sm text-warning-foreground">
        SATICI bilgileri, ticari faaliyet başlamadan önce gerçek unvan, adres, vergi
        dairesi, vergi numarası ve MERSİS numarasıyla doldurulacaktır. Alan
        doldurulmadan ödeme alınmamalıdır.
      </div>
      <p>
        <strong className="text-foreground">SATICI:</strong> — (unvan, adres, vergi
        dairesi/numarası){' '}
        <a
          href={`mailto:${BRAND.contactEmail}`}
          className="text-primary underline underline-offset-4"
        >
          {BRAND.contactEmail}
        </a>
      </p>
      <p>
        <strong className="text-foreground">ALICI:</strong> Hesap oluştururken ve ödeme
        sırasında verdiği bilgilerle belirlenen kullanıcı.
      </p>

      <LegalHeading>2. Sözleşmenin konusu</LegalHeading>
      <p>
        ALICI&apos;nın, {BRAND.name} platformunda elektronik ortamda seçtiği abonelik
        planının satışı ve ifasıdır. Hizmetin nitelikleri, satış bedeli ve ödeme
        koşulları{' '}
        <Link href="/on-bilgilendirme" className="text-primary underline underline-offset-4">
          Ön Bilgilendirme Formu&apos;nda
        </Link>{' '}
        yer alır ve bu sözleşmenin ayrılmaz parçasıdır.
      </p>

      <LegalHeading>3. Hizmetin niteliği ve ifası</LegalHeading>
      <p>
        Hizmet, internet üzerinden sunulan bir yazılım hizmetidir (SaaS). Fiziksel ürün
        teslimatı yoktur. Ödeme onaylandığı anda hizmet kullanıma açılır; ifa yeri
        ALICI&apos;nın hizmete eriştiği elektronik ortamdır.
      </p>
      <p>
        SATICI, platformun kesintisiz çalışacağını taahhüt etmez. Planlı bakımlar
        önceden duyurulmaya çalışılır.
      </p>

      <LegalHeading>4. Bedel ve ödeme</LegalHeading>
      <p>
        Satış bedeli, ödeme ekranında gösterilen ve KDV dahil (%
        {Math.round(VAT_RATE * 100)}) olan tutardır. Ödeme, ödeme kuruluşunun güvenli
        sayfası üzerinden kredi veya banka kartıyla alınır; kart bilgileri SATICI
        sistemlerine iletilmez ve saklanmaz.
      </p>
      <p>
        Ödeme <strong className="text-foreground">tek çekim</strong> olarak alınır;
        taksit seçeneği sunulmamaktadır.
      </p>

      <LegalHeading>4/A. Otomatik yenileme ve deneme sonu tahsilatı</LegalHeading>
      <p>
        ALICI, denemeye başlarken kart bilgilerini ödeme kuruluşunda kaydeder. Deneme
        süresi boyunca tahsilat yapılmaz; kartın geçerliliği 1 TL&apos;lik provizyon
        alınıp anında iade edilerek doğrulanır.
      </p>
      <p>
        <strong className="text-foreground">
          {TRIAL_DAYS} günlük deneme süresinin sonunda seçilen planın bedeli, ALICI&apos;nın
          kayıtlı kartından otomatik olarak tahsil edilir
        </strong>{' '}
        ve abonelik, ALICI iptal edene kadar seçilen dönemde kendiliğinden yenilenir.
        ALICI, ödeme adımını tamamlamakla bu otomatik tahsilata onay vermiş sayılır.
      </p>
      <p>
        ALICI, deneme süresi dolmadan önce panelden tek adımda iptal ederek hiçbir ücret
        ödemeden ayrılabilir. Her yenileme öncesinde ALICI&apos;ya e-posta ile
        bilgilendirme yapılır.
      </p>

      <LegalHeading>5. Abonelik süresi, yenileme ve iptal</LegalHeading>
      <p>
        Yeni hesaplar {TRIAL_DAYS} günlük ücretsiz deneme ile başlar. Abonelik, seçilen
        döneme göre aylık veya yıllık olarak yenilenir.
      </p>
      <p>
        ALICI aboneliğini dilediği zaman, gerekçe göstermeksizin ve tek adımda panelden
        iptal edebilir. İptalde erişim hemen kesilmez; ödenen dönemin sonuna kadar
        devam eder. İptal, o ana kadar ödenmiş bedelin iadesi anlamına gelmez; iade
        koşulları için{' '}
        <Link href="/iade" className="text-primary underline underline-offset-4">
          İade ve İptal Koşulları
        </Link>{' '}
        geçerlidir.
      </p>

      <LegalHeading>6. Cayma hakkı</LegalHeading>
      <p>
        Mesafeli Sözleşmeler Yönetmeliği&apos;nin 15. maddesi uyarınca, ALICI&apos;nın
        onayı ile ifasına başlanan hizmet sözleşmelerinde cayma hakkı kullanılamaz.
        ALICI, ödeme adımını tamamlayarak hizmetin derhal ifasına onay verdiğini kabul
        eder.
      </p>
      <p>
        Bununla birlikte SATICI, yönetmeliğin zorunlu kıldığından daha geniş bir iade
        imkânını{' '}
        <Link href="/iade" className="text-primary underline underline-offset-4">
          İade ve İptal Koşulları
        </Link>{' '}
        ile kendi iradesiyle tanımaktadır.
      </p>

      <LegalHeading>7. ALICI&apos;nın yükümlülükleri</LegalHeading>
      <p>
        ALICI, platforma girdiği öğrenci verilerini işlemek için gerekli izne sahip
        olduğunu beyan eder. Reşit olmayan öğrenciler için veli onayının alınması
        ALICI&apos;nın sorumluluğundadır. Hesap güvenliğinden ALICI sorumludur.
      </p>

      <LegalHeading>8. Kişisel verilerin korunması</LegalHeading>
      <p>
        Kişisel verilerin işlenmesine ilişkin esaslar{' '}
        <Link href="/gizlilik" className="text-primary underline underline-offset-4">
          Gizlilik ve KVKK Aydınlatma Metni&apos;nde
        </Link>{' '}
        düzenlenmiştir.
      </p>

      <LegalHeading>9. Uyuşmazlıkların çözümü</LegalHeading>
      <p>
        Ticaret Bakanlığı&apos;nca her yıl belirlenen parasal sınırlar çerçevesinde,
        ALICI&apos;nın yerleşim yerindeki Tüketici Hakem Heyetleri ve Tüketici
        Mahkemeleri yetkilidir.
      </p>

      <LegalHeading>10. Yürürlük</LegalHeading>
      <p>
        ALICI, ödeme adımını tamamlamakla bu sözleşmenin tüm koşullarını okuduğunu ve
        kabul ettiğini beyan eder. Sözleşme, ödemenin onaylandığı anda yürürlüğe girer.
      </p>
    </LegalShell>
  )
}
