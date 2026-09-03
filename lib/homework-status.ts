// Ödev/test durum sözlüğü: bir testin AKTİF durumunu türeten ve o duruma
// karşılık gelen Türkçe etiketi üreten TEK merkezî yer.
//
// Kural: Durum türetmesini ve etiket metnini üreten TEK yer burasıdır.
// Başka hiçbir dosya kendi durum sıralamasını veya etiket string'ini
// yazmamalı — hepsi buradaki `deriveTestState` ve etiket haritalarını
// kullanmalı. (lib/plan-pace.ts ile aynı kalıp.)
//
// Neden: Kitap Haritası, öğrenci mobil ekranı, Görevler ve Dashboard aynı
// test için aynı aktif durumu göstermek zorunda. Etiketler beş ayrı dosyada
// elle yazıldığı sürece bu tutarlılık sağlanamaz.

/**
 * Bir testin tek aktif durumu. Aynı test aynı anda iki aktif durum taşımaz;
 * öncelik sırası `deriveTestState` içinde tanımlıdır.
 */
export type HomeworkTestState =
  | 'completed'
  | 'pending_approval'
  | 'overdue'
  | 'returned'
  | 'assigned'
  | 'not_assigned'
  | 'no_test'

export interface DeriveTestStateInput {
  /** Aktif bir test_completions kaydı var mı (öğretmen onaylı ilerleme). */
  hasActiveCompletion?: boolean
  /** İlgili homework_items.status — açık bir ödev kaydı yoksa null. */
  itemStatus?: 'pending' | 'pending_approval' | 'completed' | 'cancelled' | null
  /** Ait olduğu homework_batches.due_date (YYYY-MM-DD) — yoksa null. */
  dueDate?: string | null
  /** homework_items.rejected_at — öğretmen iade ettiyse dolu. */
  rejectedAt?: string | null
  /** O bölümde bu test numarası yoksa true (harita matrisindeki boş hücre). */
  isMissingTest?: boolean
  /** Test edilebilirlik için enjekte edilebilir. */
  today?: Date
}

/**
 * Uygulamanın iş takvimi (R6-02).
 *
 * "Yerel gün" yeterli DEĞİLDİR: sunucu bileşenleri Vercel'de UTC'de,
 * tarayıcı ise kullanıcının saat diliminde çalışır — ikisi gece saatlerinde
 * farklı gün görür. Gecikme kararı tek bir takvime bağlanmalı. Aynı sabit
 * SQL tarafında da kullanılır: supabase/migrations/027 -> today_local().
 */
export const APP_TIME_ZONE = 'Europe/Istanbul'

// en-CA biçimi YYYY-MM-DD üretir; string karşılaştırması bu sayede
// doğrudan tarih karşılaştırması anlamına gelir.
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function toDateString(d: Date): string {
  return dayFormatter.format(d)
}

/**
 * Bugünün YEREL takvim günü (YYYY-MM-DD) — R6-02.
 *
 * `new Date().toISOString().split('T')[0]` KULLANILMAMALIDIR: o UTC gününü
 * verir ve Türkiye (UTC+3) saatiyle gece 00:00-03:00 arasında bir gün geriye
 * kayar. Aynı ödev o saatlerde bir ekranda gecikmiş, diğerinde değil görünür.
 */
export function todayDateString(today?: Date): string {
  return toDateString(today ?? new Date())
}

/**
 * Bir teslim tarihinin geçip geçmediği (R6-02).
 *
 * KURAL: Gecikme kararını veren TEK yer burasıdır. Hiçbir ekran kendi
 * karşılaştırmasını kurmamalı — özellikle `new Date(dueDate) < new Date()`
 * YAZILMAMALIDIR: `new Date('2026-08-25')` UTC gece yarısı olarak ayrışır,
 * bu yüzden Türkiye saatiyle gün içinde ödev daha teslim günü dolmadan
 * "gecikmiş" görünür. Teslim gününün TAMAMI kullanılabilir sayılır.
 *
 *   25.08 10:00 -> false
 *   25.08 23:59 -> false
 *   26.08 00:01 -> true
 *
 * @param dueDate Date-only teslim tarihi (YYYY-MM-DD). Yoksa gecikme yok.
 */
export function isOverdue(dueDate: string | null | undefined, today?: Date): boolean {
  if (!dueDate) return false
  return dueDate < toDateString(today ?? new Date())
}

/**
 * Tek aktif durumu türetir.
 *
 * Öncelik sırası (R3 v2 "Aktif durum önceliği" kuralı):
 *   completed > pending_approval > overdue > returned > assigned > not_assigned
 *
 * Kritik nokta: `pending_approval`, `overdue`'nun ÖNÜNDE gelir. Süresi geçmiş
 * bir testi öğrenci onaya gönderdiğinde aktif durum artık "Süresi Geçen"
 * değil "Onay Bekliyor"dur; geçmişte geciktiği bilgisi ayrı bir tarihçe
 * verisidir, aktif durum değil.
 */
export function deriveTestState(input: DeriveTestStateInput): HomeworkTestState {
  const { hasActiveCompletion, itemStatus, dueDate, rejectedAt, isMissingTest } = input

  if (isMissingTest) return 'no_test'
  if (hasActiveCompletion || itemStatus === 'completed') return 'completed'
  if (itemStatus === 'pending_approval') return 'pending_approval'

  // Buradan sonrası yalnızca açık (pending) bir ödev kaydı için anlamlı.
  if (itemStatus !== 'pending') return 'not_assigned'

  if (isOverdue(dueDate, input.today)) return 'overdue'
  if (rejectedAt) return 'returned'
  return 'assigned'
}

/**
 * Etiketler role göre değişir.
 *
 *   öğretmen  "Reddedildi"      · "Öğrenciden Beklenen"
 *   öğrenci   "İade Edildi"     · "Yapmadıkların"
 *   veli      "Geri gönderildi" · "Yapılmayı bekleyen"
 *
 * Veli ayrı bir dildir: ne öğretmene emir veren ne de öğrenciye seslenen
 * bir üçüncü kişi. Önceden veli ekranı `audience="student"` ile
 * çağrılıyordu ve velinin kendisine "Yapılacak" deniyormuş gibi
 * okunuyordu.
 */
export type StatusAudience = 'teacher' | 'student' | 'parent'

const TEACHER_LABEL: Record<HomeworkTestState, string> = {
  completed: 'Tamamlandı',
  pending_approval: 'Onay Bekliyor',
  overdue: 'Süresi Geçen',
  returned: 'Reddedildi',
  assigned: 'Ödevde',
  not_assigned: 'Henüz verilmedi',
  no_test: 'Test yok',
}

const STUDENT_LABEL: Record<HomeworkTestState, string> = {
  ...TEACHER_LABEL,
  returned: 'İade Edildi',
  assigned: 'Yapılacak',
}

const PARENT_LABEL: Record<HomeworkTestState, string> = {
  ...TEACHER_LABEL,
  returned: 'Geri gönderildi',
  assigned: 'Yapılacak',
}

const STATE_LABELS: Record<StatusAudience, Record<HomeworkTestState, string>> = {
  teacher: TEACHER_LABEL,
  student: STUDENT_LABEL,
  parent: PARENT_LABEL,
}

export function testStateLabel(
  state: HomeworkTestState,
  audience: StatusAudience = 'teacher'
): string {
  return STATE_LABELS[audience][state]
}

/** components/ui/badge.tsx variant adları. Renk tek başına anlam taşımaz;
 *  çağıran taraf ayrıca ikon/metin göstermelidir. */
export type TestStateVariant = 'success' | 'info' | 'destructive' | 'warning' | 'neutral'

export const TEST_STATE_VARIANT: Record<HomeworkTestState, TestStateVariant> = {
  completed: 'success',
  pending_approval: 'info',
  overdue: 'destructive',
  returned: 'warning',
  assigned: 'warning',
  not_assigned: 'neutral',
  no_test: 'neutral',
}

/**
 * Üst sayaç adları (R2 Ek Revizyon §1).
 *
 * "Süresi Geçen" ayrı bir toplam DEĞİLDİR: "Öğrenciden Beklenen"
 * çalışmaların içindeki teslim tarihi geçmiş kısmı gösterir. Bu yüzden
 * sayaç kartında OVERDUE_HINT ipucu ile birlikte gösterilmelidir —
 * aksi halde sayaçlar birbirini çelişkili biçimde topluyormuş gibi görünür.
 */
export type CounterKey = 'assigned' | 'completed' | 'pending' | 'pendingApproval' | 'overdue'

const TEACHER_COUNTER: Record<CounterKey, string> = {
  assigned: 'Öğrenciye Verilen',
  completed: 'Tamamlanan',
  pending: 'Öğrenciden Beklenen',
  pendingApproval: 'Onay Bekleyen',
  overdue: 'Süresi Geçen',
}

/**
 * Sayaç adları da role göre değişmeli.
 *
 * Öğrenci kitap sayfasında kendi ekranında "Öğrenciden Beklenen" ve
 * "Onay Bekleyen" yazıyordu — kendisinden bahseden, öğretmen ağzından
 * kurulmuş cümleler. Durum etiketleri çevriliyordu ama sayaçlar
 * çevrilmiyordu.
 */
const STUDENT_COUNTER: Record<CounterKey, string> = {
  assigned: 'Sana Verilen',
  completed: 'Tamamladığın',
  pending: 'Yapmadıkların',
  pendingApproval: 'Onay Bekleyen',
  overdue: 'Süresi Geçen',
}

const PARENT_COUNTER: Record<CounterKey, string> = {
  assigned: 'Verilen',
  completed: 'Tamamlanan',
  pending: 'Yapılmayı Bekleyen',
  pendingApproval: 'Onay Bekleyen',
  overdue: 'Süresi Geçen',
}

const COUNTER_LABELS: Record<StatusAudience, Record<CounterKey, string>> = {
  teacher: TEACHER_COUNTER,
  student: STUDENT_COUNTER,
  parent: PARENT_COUNTER,
}

export function counterLabel(key: CounterKey, audience: StatusAudience = 'teacher'): string {
  return COUNTER_LABELS[audience][key]
}

/** Geriye dönük ad — öğretmen ekranları bunu kullanmaya devam eder. */
export const COUNTER_LABEL = TEACHER_COUNTER

export const OVERDUE_HINT = 'Beklenenler içinde'
