import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalShell, LegalHeading } from '@/components/marketing/legal-shell'
import { BRAND } from '@/lib/brand'
import { PLANS, TRIAL_DAYS } from '@/lib/plans'

// Kullanım koşulları — TASLAK.
//
// UYARI: teknik olarak doğrudur (limitler ve deneme süresi lib/plans.ts'ten
// okunuyor, uydurulmuyor) ama HUKUKİ İNCELEMEDEN GEÇMEMİŞTİR. Özellikle
// sorumluluk sınırlaması, fesih ve uygulanacak hukuk maddeleri şirket
// yapısına göre yazılmalı.
//
// Sayılar koddan geliyor: metin ile ürünün ayrışması, müşteriye verilen
// sözün sessizce bozulması demek olurdu.

export const metadata: Metadata = {
  title: `Kullanım Koşulları · ${BRAND.name}`,
  description: 'Hizmetin kapsamı, hesap sorumluluğu, planlar ve fesih koşulları.',
}

export default function TermsPage() {
  return (
    <LegalShell title="Kullanım Koşulları" updatedAt="4 Eylül 2026">
      <p>
        Bu koşullar, {BRAND.name} platformunu kullanmanız hâlinde geçerlidir. Hesap
        oluşturarak bu koşulları kabul etmiş sayılırsınız.
      </p>

      <LegalHeading>Hizmetin kapsamı</LegalHeading>
      <p>
        {BRAND.name}, öğretmenlerin öğrenci takibi yapmasını sağlayan bir yazılım
        hizmetidir. Platform bir eğitim kurumu değildir, eğitim içeriği sağlamaz ve
        akademik sonuç garantisi vermez. Ödev, hedef ve müfredat kararları tamamen
        öğretmene aittir; sistem otomatik olarak ödev vermez veya çalışma seçmez.
      </p>

      <LegalHeading>Hesap sorumluluğu</LegalHeading>
      <p>
        Hesabınızın güvenliğinden siz sorumlusunuz. Öğrenci ve veli davet bağlantıları
        erişim hakkı verir; bu bağlantıları yalnız doğru kişiyle paylaşın. Yanlış kişiye
        gönderilen bir davet, panelden iptal edilebilir.
      </p>
      <p>
        Öğrenci verilerini platforma girerken, bu verileri işlemek için gerekli izne
        sahip olduğunuzu beyan edersiniz. Reşit olmayan öğrenciler için veli onayının
        alınması sizin sorumluluğunuzdadır.
      </p>

      <LegalHeading>Planlar ve sınırlar</LegalHeading>
      <p>
        Yeni hesaplar <strong className="text-foreground">{TRIAL_DAYS} günlük</strong>{' '}
        deneme süresiyle başlar. Deneme süresi sonunda bir plan seçilmezse çalışma alanı
        erişime kapatılır;{' '}
        <strong className="text-foreground">verileriniz silinmez</strong> ve plan
        seçildiğinde erişim aynı verilerle yeniden açılır.
      </p>
      <p>Planların aktif öğrenci sınırları:</p>
      <ul className="ml-5 list-disc space-y-2">
        <li>
          <strong className="text-foreground">{PLANS.starter.name}</strong> —{' '}
          {PLANS.starter.studentLimit} aktif öğrenciye kadar
        </li>
        <li>
          <strong className="text-foreground">{PLANS.coach.name}</strong> —{' '}
          {PLANS.coach.studentLimit} aktif öğrenciye kadar
        </li>
        <li>
          <strong className="text-foreground">{PLANS.institution.name}</strong> — öğrenci
          sınırı yok
        </li>
      </ul>
      <p>
        Arşivlenen öğrenciler sınıra dahil değildir. Sınıra ulaşıldığında mevcut
        verileriniz etkilenmez; yalnız yeni öğrenci ekleme durur.
      </p>

      <LegalHeading>Kabul edilmeyen kullanım</LegalHeading>
      <ul className="ml-5 list-disc space-y-2">
        <li>Başkasının verisine izinsiz erişmeye çalışmak.</li>
        <li>Platformu otomatik araçlarla aşırı yüklemek veya kota kontrollerini aşmaya çalışmak.</li>
        <li>Öğrenci verilerini eğitim takibi dışında bir amaçla kullanmak.</li>
      </ul>

      <LegalHeading>Hizmetin sürekliliği</LegalHeading>
      <p>
        Platformun kesintisiz çalışacağı garanti edilmez. Planlı bakımlar önceden
        duyurulmaya çalışılır. Hizmetin durdurulması hâlinde verilerinizi dışa aktarmanız
        için makul bir süre tanınır.
      </p>

      <LegalHeading>Hesabın kapatılması</LegalHeading>
      <p>
        Hesabınızı dilediğiniz zaman kapatabilirsiniz. Kapatma talebinde verileriniz{' '}
        <Link href="/gizlilik" className="text-primary underline underline-offset-4">
          gizlilik metninde
        </Link>{' '}
        belirtilen süre içinde silinir. Bu koşulların ihlali hâlinde hesabınız askıya
        alınabilir; böyle bir durumda gerekçe tarafınıza bildirilir.
      </p>

      <LegalHeading>Değişiklikler</LegalHeading>
      <p>
        Bu koşullar güncellenebilir. Önemli değişiklikler yürürlüğe girmeden önce
        e-posta ile bildirilir; sayfanın başındaki güncelleme tarihi her zaman geçerli
        sürümü gösterir.
      </p>
    </LegalShell>
  )
}
