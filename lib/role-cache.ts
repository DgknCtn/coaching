// ROL ÖNBELLEĞİ — middleware'in her istekte veritabanına gitmesini önler.
//
// SORUN: middleware korumalı her rotada `profiles` + `workspace_members`
// sorgusu yapıyordu. Bu sorgu yalnız SAYFA ziyaretlerinde değil, Next'in
// arka planda attığı HER RSC prefetch'inde ve her sunucu aksiyonunda da
// çalışıyor; bir menüye bakmak on isteğe, on veritabanı turuna mal
// oluyordu. Kullanıcının rolü ise dakikalar içinde değişen bir şey değil.
//
// ÇÖZÜM: karar verilen aktif workspace ve roller kısa ömürlü bir çerezde
// saklanır. Süresi dolunca ya da başka bir kullanıcıya aitse yok sayılır.
//
// NEDEN İMZASIZ — ve neden bu güvenli:
//   Çerez kullanıcı tarafından değiştirilebilir. Bunu imzalamak için yeni
//   bir sır gerekirdi; .env.example'da açıkça yazdığımız gibi, sahte sır
//   yanlış bir güvenlik varsayımı üretir. Bunun yerine önbellek
//   ASİMETRİK kullanılır:
//     - Önbellek "erişim var" diyorsa istek sayfaya geçer; sayfanın
//       kendisi (getTeacherContext) ve RLS gerçek yetkilendirmeyi zaten
//       bağımsız olarak yapar. Uydurulmuş bir çerez hiçbir veriye
//       erişim kazandırmaz, yalnız bir yönlendirmeyi atlatır.
//     - Önbellek "erişim yok" diyorsa YÖNLENDİRMEDEN ÖNCE veritabanına
//       sorulur. Böylece bozuk/eski bir çerez kimseyi kendi panelinden
//       kilitleyemez.
//   Yani önbellek yalnızca bir gidiş-dönüşü atlamak için var; yetki
//   kararının kaynağı hâlâ veritabanı ve RLS.

export const ROLE_CACHE_COOKIE = 'ws_roles'

/** Kısa: rol değişikliği (davet kabulü, rol düşürme) bu süre içinde yansır. */
export const ROLE_CACHE_MAX_AGE_SECONDS = 60

export interface CachedRoles {
  /** auth kullanıcı id'si — başka bir hesaba geçildiğinde önbellek düşer. */
  sub: string
  /** Çözülmüş aktif workspace; hangi tercihe göre hesaplandığını sabitler. */
  workspaceId: string | null
  roles: string[]
  /** Unix saniye. */
  exp: number
}

export function serializeRoleCache(value: CachedRoles): string {
  return JSON.stringify(value)
}

/**
 * Ham çerezi çözer. Bozuk, süresi dolmuş, başka kullanıcıya ait ya da
 * farklı bir workspace tercihiyle hesaplanmış değer için null döner —
 * çağıran o zaman veritabanına gider.
 */
export function parseRoleCache(
  raw: string | undefined,
  expectedSub: string,
  preferredWorkspaceId: string | null,
  nowSeconds: number
): CachedRoles | null {
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const v = parsed as Partial<CachedRoles>

  if (typeof v.sub !== 'string' || v.sub !== expectedSub) return null
  if (typeof v.exp !== 'number' || v.exp <= nowSeconds) return null
  if (!Array.isArray(v.roles) || v.roles.some(r => typeof r !== 'string')) return null
  if (v.workspaceId !== null && typeof v.workspaceId !== 'string') return null

  // Kullanıcı çalışma alanı değiştirdiyse önbellek başka bir alanın
  // rollerini taşıyor olabilir; tercih çerezi bir değer söylüyorsa
  // önbellekteki çözümün onunla uyuşması gerekir.
  if (preferredWorkspaceId && v.workspaceId !== preferredWorkspaceId) return null

  return v as CachedRoles
}
