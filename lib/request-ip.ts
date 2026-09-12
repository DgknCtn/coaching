import { headers } from 'next/headers'

/**
 * İSTEMCİNİN IP ADRESİ VE CİHAZ BİLGİSİ — tek kaynak.
 *
 * NEDEN AYRI DOSYA: bu mantık `lib/rate-limit.ts` içinde özel bir
 * fonksiyondu. Giriş/çıkış denetim kaydı da aynı bilgiye ihtiyaç duyuyor
 * ve ikinci bir kopya çıkarmak, biri düzeltilirken diğerinin eskimesi
 * demekti — hız sınırı bir IP'yi görürken denetim kaydının başkasını
 * yazması, ikisini karşılaştırmayı imkânsız kılardı.
 *
 * Kopyalanmadı, TAŞINDI: rate-limit artık buradan okuyor.
 */

/** IP başlığı hiç yoksa kullanılan sabit kova. */
export const UNKNOWN_IP = 'bilinmeyen'

/**
 * İstemcinin IP adresi.
 *
 * Vercel `x-forwarded-for` başlığını KENDİSİ yazar ve istemcinin
 * gönderdiğini ezer, bu yüzden ilk değer güvenilirdir. Kendi başımıza
 * barındırılan bir ortamda bu doğru OLMAYABİLİR: ters vekil sunucu
 * başlığı ezmiyorsa istemci istediğini yazabilir. Bugün Vercel'deyiz;
 * taşınırsa burası yeniden değerlendirilmeli.
 *
 * Başlık hiç yoksa sabit bir kovaya düşülür — kaba, ama hız sınırını
 * tamamen açık bırakmaktan iyidir.
 */
export async function clientIp(): Promise<string> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || UNKNOWN_IP
}

/**
 * Denetim kaydı için istek bağlamı: IP, cihaz ve kabaca konum.
 *
 * KONUM EK BİR SERVİS GEREKTİRMİYOR: Vercel isteğe `x-vercel-ip-country`
 * ve `x-vercel-ip-city` başlıklarını kendisi ekliyor. Üçüncü taraf bir
 * GeoIP servisine IP göndermek, kullanıcının adresini bizim
 * denetlemediğimiz bir yere taşımak olurdu.
 *
 * USER AGENT KIRPILIR: bazı tarayıcı eklentileri bu başlığı çok uzun
 * yazıyor; sınırsız bir metin sütunu, denetim tablosunu şişirmekten
 * başka bir şey yapmaz.
 */
export interface RequestContext {
  ip: string | null
  userAgent: string | null
  country: string | null
  city: string | null
}

const MAX_USER_AGENT_LENGTH = 400

export async function requestContext(): Promise<RequestContext> {
  const h = await headers()
  const ip = await clientIp()
  const ua = h.get('user-agent')

  return {
    // 'bilinmeyen' veritabanına yazılmaz: INET sütununa geçersiz bir
    // değer koymaktansa NULL doğru cevap. Hız sınırı için sabit kova
    // gerekliydi, denetim kaydı için değil.
    ip: ip === UNKNOWN_IP ? null : ip,
    userAgent: ua ? ua.slice(0, MAX_USER_AGENT_LENGTH) : null,
    country: h.get('x-vercel-ip-country'),
    city: decodeCity(h.get('x-vercel-ip-city')),
  }
}

/**
 * Vercel şehir başlığını yüzde kodlamasıyla gönderiyor ("Istanbul" değil
 * "Istanbul", ama Türkçe karakterli şehirlerde "%C4%B0zmir"). Çözülmezse
 * denetim tablosunda okunamaz bir metin kalırdı.
 */
function decodeCity(raw: string | null): string | null {
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    // Bozuk kodlama: ham değeri yazmak, hiç yazmamaktan iyi.
    return raw
  }
}
