import Link from 'next/link'
import { AlertBanner } from '@/components/shared/alert-banner'
import { buttonVariants } from '@/components/ui/button'

// BİR BÖLÜMÜN VERİSİ GELMEDİ (PRD · B01, §20)
//
// NEDEN AYRI BİR BİLEŞEN: sorgusu başarısız olan bölüm eskiden sessizce
// GİZLENİYORDU (`list.length > 0 && ...`). Gizlenen bölüm, veri yokmuş
// gibi okunur: velinin ekranında "bu ay ders yok", "kitap atanmamış"
// anlamına gelir. Oysa gerçek şu: bilmiyoruz.
//
// Bu bileşen o boşluğu açıkça "yüklenemedi" diye dolduruyor. Başarıyla
// gelen bölümler yerinde kalıyor — tek bir sorgunun arızası sayfanın
// tamamını boşaltmıyor.
//
// `segment-error.tsx` ile ilişkisi: o, FIRLATILAN hataların segment
// sınırı. Supabase hata fırlatmadığı için sorgu hataları oraya hiç
// ulaşmıyordu; bu bileşen o boşluğun bölüm düzeyindeki karşılığı.
// Metin de oradan: "Bu bölüm yüklenemedi" / "Tekrar dene". İki hata
// ekranının farklı dil konuşması, en son fark edilecek tutarsızlıktır.

export function SectionUnavailable({
  title = 'Bu bölüm yüklenemedi',
  description = 'Veriler şu an alınamadı. Bu, bilginin olmadığı anlamına gelmez.',
  retryHref,
}: {
  title?: string
  description?: string
  /**
   * Aynı sayfanın adresi. Sunucu bileşeni `force-dynamic` olduğu için
   * aynı adrese gitmek sorguları yeniden çalıştırır — istemci JS'i
   * gerekmez.
   */
  retryHref: string
}) {
  return (
    <AlertBanner
      tone="warning"
      title={title}
      description={description}
      action={
        <Link href={retryHref} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
          Tekrar dene
        </Link>
      }
    />
  )
}
