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
  const has = (id: string | null) =>
    !!id && memberships.some(m => m.workspaceId === id)

  if (has(preferredId)) return preferredId
  if (has(defaultId)) return defaultId
  return memberships[0]?.workspaceId ?? null
}

/** Aynı workspace'te birden çok rol olabilir (owner + teacher gibi). */
export function rolesInWorkspace(
  memberships: WorkspaceMembership[],
  workspaceId: string | null
): string[] {
  if (!workspaceId) return []
  return memberships.filter(m => m.workspaceId === workspaceId).map(m => m.role)
}
