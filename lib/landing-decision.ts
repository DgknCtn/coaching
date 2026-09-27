// ============================================================
// OTURUMU OLAN KULLANICI "/" ADRESİNDE NEREYE GİDER — TEK KARAR
//
// Önceden çalışma alanı olmayan HERKES otomatik öğretmen yapılıyordu
// (app/page.tsx geç kurulumu). Google girişi açılınca bu bir açık hâline
// geldi: davet linkini kullanmadan /login'den Google ile giren öğrenci
// kendi öğretmen alanını açıyor, sonra davetini de kabul edemiyordu.
//
// İLKE: rolü hesap açma işlemi değil DAVET belirler. Öğretmen olmak açık
// bir seçimdir (kayıt formu, kayıt sayfasındaki Google düğmesi ya da
// /hosgeldin'deki "Öğretmenim" kartı); öğrenci/veli olmak bir davetin
// kabulüdür.
// ============================================================

export type Landing =
  /** Profil okunamadı — karar verilmez, /erisim açıklar (12 Eylül olayı). */
  | 'access-error'
  /** Çalışma alanı var — rolüne göre panele. */
  | 'route-by-role'
  /** Öğretmen olmak istediği biliniyor — alanı kur. */
  | 'setup-teacher'
  /** Niyet bilinmiyor — bekleyen davetleri göster ya da rol sor. */
  | 'welcome'

export interface LandingInput {
  profileError: boolean
  hasWorkspace: boolean
  /** Kayıt üst verisi (user_metadata). */
  metadata: Record<string, unknown> | null | undefined
}

/**
 * Kullanıcı öğretmen olmak istediğini AÇIKÇA söyledi mi?
 *
 *   - `signup_intent: 'teacher'` — kayıt formu yazar (registerAction).
 *   - `workspace_name` anahtarı — bu alan eklenmeden ÖNCE e-postayla kayıt
 *     olup doğrulamayı bekleyen öğretmenler. Kayıt formu bu anahtarı her
 *     zaman yazıyordu; Google üst verisinde hiç yok. Anahtarın VARLIĞI
 *     (değeri null olabilir) niyeti gösteriyor.
 */
export function hasTeacherIntent(metadata: LandingInput['metadata']): boolean {
  if (!metadata) return false
  return metadata.signup_intent === 'teacher' || 'workspace_name' in metadata
}

export function decideLanding(input: LandingInput): Landing {
  if (input.profileError) return 'access-error'
  if (input.hasWorkspace) return 'route-by-role'
  return hasTeacherIntent(input.metadata) ? 'setup-teacher' : 'welcome'
}

/** Davet kabul edildikten sonra açılacak panel. */
export function panelForRole(role: string | null | undefined): string {
  if (role === 'student') return '/student'
  if (role === 'parent') return '/parent'
  if (role === 'owner' || role === 'teacher') return '/teacher'
  return '/'
}
