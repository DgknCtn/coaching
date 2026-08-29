// Öğrenci Kaynak Planı sözlüğü ve türetmeleri (R5.1).
//
// Kural: Kitap Durumu ve Kaynak Rolü etiketlerinin TEK yeri burasıdır.
// Ekranlar kendi string'ini yazmaz — lib/homework-status.ts ve
// lib/unit-labels.ts ile aynı kalıp.
//
// Şartmenin cevapladığı soru: "Bu kaynak bu öğrenci için NEDEN kullanılıyor,
// ne kadarının tamamlanmasını planladık ve hedef tarihe göre neredeyiz?"
// Rol o "neden"in kaydıdır; durum ise kaynağın plandaki yaşam evresi.

/**
 * Kitap Durumu (§3.1).
 *
 * DB'de `student_book_assignments.status` beş değer taşıyabilir; kullanıcıya
 * görünen üçü bunlar. `paused` ve `archived` geriye dönük uyum için duruyor
 * ve arayüzde "Bekliyor" gibi okunur (ayrı bir kavram üretmemek için).
 */
export const BOOK_PLAN_STATUSES = ['pending', 'active', 'completed'] as const
export type BookPlanStatus = (typeof BOOK_PLAN_STATUSES)[number]

const STATUS_LABEL: Record<string, string> = {
  pending: 'Bekliyor',
  active: 'Aktif',
  completed: 'Hedef Tamamlandı',
  // Geriye dönük değerler
  paused: 'Bekliyor',
  archived: 'Arşivlendi',
}

export const BOOK_PLAN_STATUS_OPTIONS: { value: BookPlanStatus; label: string }[] =
  BOOK_PLAN_STATUSES.map(v => ({ value: v, label: STATUS_LABEL[v] }))

export function bookPlanStatusLabel(status: string | null | undefined): string {
  return STATUS_LABEL[status ?? 'active'] ?? 'Aktif'
}

/** Kaynak Planı ekranında kaynakların gruplandığı üç kova (§3.5). */
export type BookPlanGroup = 'active' | 'pending' | 'completed'

/**
 * DB durumunu görüntüleme grubuna indirger.
 * `paused` bilinçli olarak Bekliyor'a düşer: kullanıcı için "şu an
 * çalışılmıyor" demek ikisinde de aynı şeydir.
 */
export function bookPlanGroup(status: string | null | undefined): BookPlanGroup {
  if (status === 'completed') return 'completed'
  if (status === 'pending' || status === 'paused') return 'pending'
  return 'active'
}

export const BOOK_PLAN_GROUP_LABEL: Record<BookPlanGroup, string> = {
  active: 'Aktif kaynaklar',
  pending: 'Bekleyen kaynaklar',
  completed: 'Hedefi tamamlanan kaynaklar',
}

/**
 * Kaynak Rolü (§3.1).
 *
 * Rol KİTABIN değil ÖĞRENCİ-KİTAP İLİŞKİSİNİN özelliğidir: aynı kitap bir
 * öğrencide "Ana Çalışma", başkasında "Pekiştirme" olabilir ve süreç içinde
 * değişir. Değişmesi ilerleme verisine dokunmaz (KP-06).
 */
export const BOOK_ROLES = [
  'temel_olusturma',
  'ana_calisma',
  'pekistirme',
  'yeniden_temas',
] as const
export type BookRole = (typeof BOOK_ROLES)[number]

const ROLE_LABEL: Record<BookRole, string> = {
  temel_olusturma: 'Temel Oluşturma',
  ana_calisma: 'Ana Çalışma',
  pekistirme: 'Pekiştirme',
  yeniden_temas: 'Yeniden Temas',
}

export const BOOK_ROLE_OPTIONS: { value: BookRole; label: string }[] = BOOK_ROLES.map(v => ({
  value: v,
  label: ROLE_LABEL[v],
}))

/** Rol atanmamışsa null döner — arayüz o zaman rozeti hiç göstermez. */
export function bookRoleLabel(role: string | null | undefined): string | null {
  if (!role) return null
  return ROLE_LABEL[role as BookRole] ?? null
}

/**
 * Hedef Türü (§3.2).
 *
 * Tam Kitap: kitabın tüm takip edilebilir kapsamı hedef paydasına girer.
 * Seçili Kapsam: yalnız eğitmenin seçtiği bölüm/birimler.
 */
export function targetTypeLabel(scopeType: string | null | undefined): string {
  return scopeType === 'whole_book' || !scopeType ? 'Tam Kitap' : 'Seçili Kapsam'
}
