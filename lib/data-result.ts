import { reportError } from '@/lib/observability'

// VERİ SONUCU SÖZLEŞMESİ (PRD · B01, I01)
//
// ============================================================
// NEDEN VAR
//
// Supabase istemcisi sorgu hatasında FIRLATMAZ, `{ data: null, error }`
// döner. Kod tabanında bu sonuç çoğu yerde şöyle okunuyordu:
//
//   const [{ data: batches }] = await Promise.all([...])
//   const list = batches ?? []
//
// `error` hiç okunmuyor. Yani "veri gelmedi" ile "veri yok" AYNI ŞEY
// oluyor: hata sessizce boş diziye dönüşüyor.
//
// Bunun ürün karşılığı ölçüldü (`app/(dashboard)/parent/page.tsx`):
// ödev sorgusu hata verirse gecikme sayısı 0 çıkıyor, kitap verisi
// geldiyse "etkinlik var" sayılıyor ve veliye **"Her şey yolunda"**
// gösteriliyordu. Yani ürünün en güven verici cümlesi, bir arızanın
// sonucu olarak üretilebiliyordu.
//
// Aynı yol "Henüz veri yok · Öğretmen henüz kitap veya ödev atamamış"
// mesajını da üretebiliyordu — öğretmen atamış olsa bile. Hata, yanlış
// bir kişiyi suçlayan bir açıklamaya dönüşüyordu.
//
// ============================================================
// TASARIM: HATA DURUMUNDA VERİ ELDE EDİLEMEZ
//
// `QueryResult<T>` ayrık bir birleşim. `ok: false` dalında `data` alanı
// YOK — yani "hata olsa bile boş diziyle devam et" yazmak tip
// hatasıdır. Çağıran önce `ok`'a bakmak ZORUNDA.
//
// Bu, `?? []`'yi yasaklamanın tek güvenilir yolu. Kod incelemesinde
// "error'ı kontrol et" demek bu depoda iki yıl işe yaramadı; derleyici
// her seferinde hatırlatır.
//
// ============================================================
// "BOŞ" AYRI BİR DURUM DEĞİL
//
// Başarılı bir liste sorgusunun boş dönmesi `ok: true, data: []`.
// Ayrı bir `empty` durumu eklemek, aynı bilgiyi iki yerde taşımak
// olurdu. Ayrımın asıl anlamı hata/başarı arasında; boşluk başarının
// bir alt hâli.
//
// ============================================================
// HATA RAPORLANIR
//
// Kullanıcıya "bu bölüm yüklenemedi" demek yetmez: aynı hata
// işletmeye de görünmeli. Her başarısızlık `reportError` ile Vercel
// loglarına yazılıyor (OBS-01). Sessizce kullanıcıya gösterilen ama
// kimsenin görmediği hata, düzeltilmeyen hatadır.
// ============================================================

/** Supabase yanıtının bu modülün ihtiyaç duyduğu kısmı. */
interface SupabaseResponse<T> {
  data: T | null
  error: { message: string; code?: string } | null
}

export type QueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

function fail<T>(
  error: { message: string; code?: string },
  source: string
): QueryResult<T> {
  reportError(new Error(error.message), {
    source,
    scope: 'data-result',
    code: error.code,
  })
  return { ok: false, error: error.message }
}

/**
 * Liste sorgusu. Başarıda `data` her zaman bir dizidir (boş olabilir).
 *
 * Buradaki `?? []` GÜVENLİ ve bilinçli: hata yoksa Supabase liste
 * sorgusunda `null` döndürmez; tek istisna, zaten yukarıda ayrıştırılan
 * hata durumudur. Yani bu satır "hatayı boşa çevir" değil, "başarılı
 * sorgunun tipini daralt" anlamına geliyor.
 *
 * @param source Raporlamada hangi sorgunun düştüğünü ayırt etmek için.
 */
export function listResult<T>(response: SupabaseResponse<T[]>, source: string): QueryResult<T[]> {
  if (response.error) return fail<T[]>(response.error, source)
  return { ok: true, data: response.data ?? [] }
}

/**
 * Tek kayıt sorgusu (`maybeSingle`, `rpc`). Başarıda `data` null
 * olabilir — "kayıt yok" meşru bir sonuç ve hata DEĞİL.
 */
export function singleResult<T>(response: SupabaseResponse<T>, source: string): QueryResult<T | null> {
  if (response.error) return fail<T | null>(response.error, source)
  return { ok: true, data: response.data }
}

/**
 * Türetilen bir yargı birden fazla sorguya dayanıyorsa, HEPSİ başarılı
 * olmadan verilmez.
 *
 * Örnek: "Her şey yolunda" hem ödev durumuna hem kitap ilerlemesine
 * bakıyor. Biri gelmediyse yargı "olumlu" değil "bilinmiyor"dur.
 */
export function allOk(...results: QueryResult<unknown>[]): boolean {
  return results.every(r => r.ok)
}
