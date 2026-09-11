// AKTİF WORKSPACE — çok kiracılığın eksik parçası.
//
// SORUN: tüm okuma yolu `profiles.default_workspace_id` üzerinden geçiyordu
// ve bunu değiştirecek hiçbir arayüz yoktu. Dahası `accept_invitation` bu
// alanı yalnız BOŞKEN yazıyor: zaten bir workspace'i olan bir öğretmen
// ikinci bir kuruma davet edilirse o kurumun verisi görünmez oluyordu —
// üstelik hata da almadan. Sessiz başarısızlık, kullanıcının bildireceği
// türden bile değil.
//
// ÇÖZÜM: aktif workspace bir çerezde tutulur; `default_workspace_id` artık
// yalnız VARSAYILAN, tek kaynak değil.
//
// NEDEN ÇEREZ: değer sunucuda okunabilmeli. Hem middleware hem sunucu
// bileşenleri aynı değeri görmek zorunda — biri "erişim yok" derken
// diğerinin sayfayı çizmesi, bu kod tabanında zaten bir kez yaşandı
// (assistant rolü). localStorage sunucuda okunamaz.
//
// GÜVENLİK: çerez KULLANICI TARAFINDAN DEĞİŞTİRİLEBİLİR ve öyle kabul
// edilir. İçindeki değer bir yetki değil, bir TERCİHTİR: her okumada
// kullanıcının o workspace'te gerçekten aktif üyeliği olup olmadığı
// doğrulanır (resolveActiveWorkspaceId). Doğrulanmazsa varsayılana düşülür.
// Üstelik RLS de bağımsız olarak aynı kontrolü yapar; çerezi elle
// değiştiren biri başka bir kiracının verisini göremez.
//
// BU MODÜL SAFTIR ve bilinçli olarak `next/headers` içe AKTARMAZ:
// middleware Edge çalışma zamanında koşuyor ve orada o modül yok. Çerez
// okuma her iki tarafta kendi yöntemiyle yapılır (middleware
// `request.cookies`, sunucu bileşenleri `lib/workspace.ts`), karar burada
// tek yerde verilir.

export const ACTIVE_WORKSPACE_COOKIE = 'active_workspace'

export interface WorkspaceMembership {
  workspaceId: string
  role: string
}

/**
 * Hangi workspace aktif?
 *
 * Sıra: çerezdeki tercih (üyelik doğrulanırsa) → profilin varsayılanı
 * (yine doğrulanırsa) → üyeliklerin ilki.
 *
 * Varsayılanın da doğrulanması önemli: kullanıcı bir kurumdan çıkarılmışsa
 * `default_workspace_id` hâlâ o kurumu gösteriyor olabilir ve kullanıcı
 * hiçbir yere giremezdi.
 */
export function resolveActiveWorkspaceId(
  memberships: WorkspaceMembership[],
  preferredId: string | null,
  defaultId: string | null
): string | null {
  return resolveActiveWorkspace(memberships, preferredId, defaultId).workspaceId
}

/**
 * Hangi kaynaktan seçildi?
 *
 * `cookie`  kullanıcının açık tercihi kullanıldı.
 * `default` tercih yoktu; profilin varsayılanına düşüldü.
 * `first`   ikisi de tutmadı; ilk üyeliğe düşüldü.
 * `none`    hiç üyelik yok.
 */
export type WorkspaceSource = 'cookie' | 'default' | 'first' | 'none'

export interface WorkspaceResolution {
  workspaceId: string | null
  source: WorkspaceSource
  /**
   * Çerezde bir tercih VARDI ama doğrulanamadı — bu yüzden yok sayıldı.
   *
   * NEDEN AYRI ALAN: bu, kullanıcının hiçbir şey silmeden bambaşka bir
   * veri seti görmesinin tek sessiz yolu (P0 / 07 Eylül 2026 raporu).
   * Çözümlemenin kendisi doğru davranıyor — kusur, doğru davranışın
   * hiçbir iz bırakmaması. Çağıran taraf bunu görüp loglayabilsin diye
   * karar ile birlikte dışarı verilir.
   */
  rejectedPreference: string | null
}

/**
 * `resolveActiveWorkspaceId`'nin gerekçesini de veren hâli.
 *
 * Karar mantığı birebir aynıdır; yalnız hangi dala girildiği de dönülür.
 * İki fonksiyonun ayrı kopyalar olmaması önemli: kural değişirse ikisi
 * birden değişsin diye id döndüren sürüm buna delege eder.
 */
export function resolveActiveWorkspace(
  memberships: WorkspaceMembership[],
  preferredId: string | null,
  defaultId: string | null
): WorkspaceResolution {
  const has = (id: string | null) =>
    !!id && memberships.some(m => m.workspaceId === id)

  if (has(preferredId)) {
    return { workspaceId: preferredId, source: 'cookie', rejectedPreference: null }
  }

  // Tercih vardı ama üyelik doğrulanmadı: çerez elle değiştirilmiş,
  // kullanıcı o alandan çıkarılmış ya da alan askıya alınmış olabilir.
  const rejectedPreference = preferredId ?? null

  if (has(defaultId)) {
    return { workspaceId: defaultId, source: 'default', rejectedPreference }
  }

  const first = memberships[0]?.workspaceId ?? null
  return {
    workspaceId: first,
    source: first ? 'first' : 'none',
    rejectedPreference,
  }
}

/** Aynı workspace'te birden çok rol olabilir (owner + teacher gibi). */
export function rolesInWorkspace(
  memberships: WorkspaceMembership[],
  workspaceId: string | null
): string[] {
  if (!workspaceId) return []
  return memberships.filter(m => m.workspaceId === workspaceId).map(m => m.role)
}
