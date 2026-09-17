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

/**
 * Bir anın YEREL takvim günü (YYYY-MM-DD).
 *
 * DIŞA AÇIK, çünkü gün bazında gruplama yapan her yer aynı takvimi
 * kullanmak zorunda: ikinci bir `Intl.DateTimeFormat` kuran modül, gece
 * 00:00-03:00 arasında bir günlük kayma üretir ve aynı teslim iki
 * ekranda iki farklı güne düşer.
 */
export function localDateString(d: Date): string {
  return dayFormatter.format(d)
}

function toDateString(d: Date): string {
  return localDateString(d)
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
 * Bir ödev GRUBUNUN tek aktif durumu.
 *
 * `HomeworkTestState`'in grup ölçeğindeki karşılığı; aynı öncelik
 * mantığını taşır ama `no_test` / `not_assigned` gibi tek teste özgü
 * durumları içermez — bir grup ya vardır ya yoktur.
 */
export type HomeworkBatchState =
  | 'overdue'
  | 'returned'
  | 'assigned'
  | 'pending_approval'
  | 'completed'

export interface BatchItemInput {
  status: string | null | undefined
  rejected_at?: string | null
}

export interface DeriveBatchStateInput {
  dueDate?: string | null
  items: BatchItemInput[]
  today?: Date
}

/**
 * Grubun aktif durumu.
 *
 * ============================================================
 * NEDEN VAR — kaybolan ödev
 *
 * Öğrenci ve veli ekranları grupları "tarihi geçmiş VE içinde pending
 * kalem olanlar" / "tarihi geçmemiş olanlar" diye ikiye ayırıyordu.
 * Tarihi geçmiş ama bütün kalemleri onaya gönderilmiş — ya da öğretmen
 * tarafından İADE EDİLMİŞ — bir grup iki listeye de girmiyor, ekrandan
 * tamamen kayboluyordu. Başka ödev yoksa öğrenciye "Tüm ödevler
 * tamamlandı" bile deniyordu.
 *
 * Bu, ürünün temelindeki "teslim edildi" ile "öğretmen onayladı"
 * ayrımını bozan bir hataydı. Durum artık tarih filtresinden değil
 * buradan türer; her grup tam olarak bir listeye düşer.
 * ============================================================
 *
 * ÖNCELİK, deriveTestState İLE AYNI: `pending_approval` gecikmenin
 * önündedir — süresi geçmiş bir ödevi öğrenci onaya gönderdiğinde aktif
 * durum artık "Süresi Geçen" değil "Onay Bekliyor"dur. Aynı şekilde
 * `overdue`, `returned`'ın önündedir.
 *
 * `cancelled` kalemler HİÇ SAYILMAZ: iptal edilmiş bir kalem ne bekleyen
 * iştir ne de tamamlanmış.
 */
export function deriveBatchState(input: DeriveBatchStateInput): HomeworkBatchState {
  const items = input.items.filter((i) => i.status !== 'cancelled')

  // Kalemsiz grup: "tamamlandı" demek yanlış olurdu — içinde hiçbir şey
  // yok. Görünür kalması, sessizce kaybolmasından iyi.
  if (items.length === 0) return 'assigned'

  const open = items.filter((i) => i.status === 'pending')

  if (open.length > 0) {
    if (isOverdue(input.dueDate, input.today)) return 'overdue'
    if (open.some((i) => i.rejected_at)) return 'returned'
    return 'assigned'
  }

  if (items.some((i) => i.status === 'pending_approval')) return 'pending_approval'

  return 'completed'
}

/** Öğrencinin hâlâ bir şey yapması gereken durumlar. */
export const OPEN_BATCH_STATES: readonly HomeworkBatchState[] = [
  'overdue',
  'returned',
  'assigned',
]

/** Grup öğrenciden eylem bekliyor mu? Veli özeti ve sayaçlar bunu sorar. */
export function isOpenBatch(state: HomeworkBatchState): boolean {
  return OPEN_BATCH_STATES.includes(state)
}

/**
 * Grup başlıkları. Tek test etiketlerinden AYRI: bir grup için "Ödevde"
 * demek tuhaf kaçıyor, "Yapılacak" doğru.
 */
const BATCH_LABEL: Record<StatusAudience, Record<HomeworkBatchState, string>> = {
  teacher: {
    overdue: 'Süresi geçen',
    returned: 'İade edilen',
    assigned: 'Öğrenciden beklenen',
    pending_approval: 'Onay bekleyen',
    completed: 'Tamamlanan',
  },
  student: {
    overdue: 'Geciken',
    returned: 'Düzeltme istenen',
    assigned: 'Yapılacak',
    pending_approval: 'Onay bekleyen',
    completed: 'Tamamlanan',
  },
  parent: {
    overdue: 'Geciken',
    returned: 'Geri gönderilen',
    assigned: 'Yapılmayı bekleyen',
    pending_approval: 'Onay bekleyen',
    completed: 'Tamamlanan',
  },
}

export function batchStateLabel(
  state: HomeworkBatchState,
  audience: StatusAudience = 'teacher'
): string {
  return BATCH_LABEL[audience][state]
}

export const BATCH_STATE_VARIANT: Record<HomeworkBatchState, TestStateVariant> = {
  overdue: 'destructive',
  returned: 'warning',
  assigned: 'warning',
  pending_approval: 'info',
  completed: 'success',
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
/**
 * `overdueThisWeek` ve `pastDebt` — R7-06.11.
 *
 * Öğrenci aynı ekranda "5 gecikmiş ödev" uyarısı ile "Geciken 0"
 * sayacını yan yana görüyordu. İkisi de DOĞRUYDU: uyarı öğrencinin tüm
 * açık borcunu, sayaç ise yalnız bu haftayı sayıyor. Yanlış olan,
 * etiketin kapsamını söylememesiydi — kullanıcı 0'ın neyin sıfırı
 * olduğunu çıkarım yapmak zorunda kalıyordu.
 *
 * Çözüm iki sayacı ayrı ADLANDIRMAK, birini gizlemek değil: geçmiş borç
 * gerçek bir bilgi ve öğrencinin onu görmesi gerekiyor — yalnız güncel
 * haftanın işiyle karışmaması şartıyla (R7-06.02).
 */
export type CounterKey =
  | 'assigned'
  | 'completed'
  | 'pending'
  | 'pendingApproval'
  | 'overdue'
  | 'overdueThisWeek'
  | 'pastDebt'

const TEACHER_COUNTER: Record<CounterKey, string> = {
  assigned: 'Öğrenciye Verilen',
  completed: 'Tamamlanan',
  pending: 'Öğrenciden Beklenen',
  pendingApproval: 'Onay Bekleyen',
  overdue: 'Süresi Geçen',
  overdueThisWeek: 'Bu Hafta Geciken',
  pastDebt: 'Geçmiş Borç',
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
  overdueThisWeek: 'Bu hafta geciken',
  pastDebt: 'Geçmiş borç',
}

const PARENT_COUNTER: Record<CounterKey, string> = {
  assigned: 'Verilen',
  completed: 'Tamamlanan',
  pending: 'Yapılmayı Bekleyen',
  pendingApproval: 'Onay Bekleyen',
  overdue: 'Süresi Geçen',
  overdueThisWeek: 'Bu hafta geciken',
  pastDebt: 'Geçmiş borç',
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

// ============================================================
// ÖDEV İÇİ SIRA (R7-06.07)
// ============================================================

/**
 * Bir ödevin içindeki çalışmaların sırası — TEK karar yeri.
 *
 * SORUN: hiçbir sorgu kalemler için `order by` vermiyordu, yani sıra
 * Postgres'in döndürdüğü sıraydı. Öğrenci 1,3,4,5,6,7 kapsamını
 * 4,6,1,7,5,3 olarak gördü. Veri doğruydu; çalışma sırası rastgele
 * hissi veriyordu ve bu, kağıt üstünde ödev yapan bir öğrenci için
 * gereksiz bir yük.
 *
 * SIRA: önce kitap bölümü (`book_sections.order_index`), sonra
 * test/sayfa numarası (`book_tests.order_index`). Belgenin şartı.
 *
 * SAYFA TAKİPLİ KİTAP: birim tek bir fiziksel sayfadır (022) ve gerçek
 * sayfa numarası `page_start`'tadır — `order_index` ile aynı değer.
 * Çağıran taraf hangisini bulursa onu verir; ikisi de yoksa kalem
 * sonda toplanır (numarasız bir çalışmayı listenin başına koymak,
 * numaralı olanların sırasını görünmez kılardı).
 *
 * NEDEN lib'DE: aynı sıra DÖRT yüzeyde birden korunmak zorunda
 * (belge: öğrenci Ödevlerim, öğretmen Yayınlanan, onay listesi ve
 * kopyalanan ödev metni). Dört yerde ayrı `sort` yazılsaydı biri
 * güncellenmeyi kaçırır ve aynı ödev iki ekranda iki sırada görünürdü.
 */
export interface OrderableHomeworkItem {
  /** `book_sections.order_index` — yoksa kalem sonda toplanır. */
  sectionOrderIndex?: number | null
  /** `book_tests.order_index` ya da sayfa kitabında `page_start`. */
  unitOrderIndex?: number | null
}

/** Numarası olmayan kalem sonda toplanır — Infinity bunu sağlar. */
function orderKey(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
}

export function compareHomeworkItems(
  a: OrderableHomeworkItem,
  b: OrderableHomeworkItem
): number {
  const sectionDiff = orderKey(a.sectionOrderIndex) - orderKey(b.sectionOrderIndex)
  if (sectionDiff !== 0) return sectionDiff
  return orderKey(a.unitOrderIndex) - orderKey(b.unitOrderIndex)
}

/** `compareHomeworkItems`'ı dizi üzerinde uygular; girdiyi bozmaz. */
export function sortHomeworkItems<T extends OrderableHomeworkItem>(items: readonly T[]): T[] {
  return [...items].sort(compareHomeworkItems)
}

// ============================================================
// GÜNCEL HAFTA / GEÇMİŞ BORÇ (R7-06.02)
// ============================================================

/**
 * Öğrencinin ödevlerini "bu haftanın işi" ve "geçmiş borç" olarak ayırır.
 *
 * PEDAGOJİK İLKE (belge): *"Güncel hafta öğrencinin ana çalışma
 * alanıdır; geçmiş borç öğrenciyi yıl boyu 'borçlu' tutmamalı."*
 *
 * Testte görülen: öğrenci ekrana girdiğinde önce 5 eski gecikmiş ödev
 * görüyordu, güncel haftanın Mini Test Ödevi altta Yapılacak bölümüne
 * gömülüyordu. Sebep, ekranın ödevleri YALNIZ duruma göre sıralaması
 * ("geciken" her zaman en üstte) ve akış aidiyetinden habersiz olması.
 * Gerçek bir öğrencide geçmiş borç arttıkça güncel haftanın işi
 * görünmez hale gelir.
 *
 * AİDİYET TÜRETİLMİYOR, OKUNUYOR: karar `homework_batches.weekly_flow_id`
 * üzerinden — 077'nin kurduğu kayıtlı aidiyet. Tarihten çıkarılsaydı
 * akışın kapanışı sonradan taşındığında ödev başka bir haftaya ait
 * görünürdü (077'nin açılış notu).
 *
 * ARŞİVLENMİŞ ÖDEV HİÇBİR KOVAYA GİRMEZ (R7-06.01): aktif yükten
 * çıkarılmış iş, geçmiş borç olarak da sayılmaz — çıkarmanın amacı tam
 * olarak buydu. Geçmişte görünmeye devam eder ama ayrı bir blokta.
 */
export interface FlowOwnedBatch {
  /** `homework_batches.weekly_flow_id` — akış kavramından önceki ödevlerde null. */
  weekly_flow_id?: string | null
  /** `homework_batches.status` — 'archived' aktif borç değildir. */
  status?: string | null
}

export interface FlowOwnershipSplit<T> {
  /** Aktif Haftalık Akışa bağlı ödevler — ekranın ilk çalışma alanı. */
  currentWeek: T[]
  /** Geçmiş haftalardan kalan açık borç — varsayılan kapalı blokta. */
  pastDebt: T[]
  /** Aktif yükten çıkarılmış ödevler — hiçbir sayaca girmez. */
  released: T[]
}

export function splitByFlowOwnership<T extends FlowOwnedBatch>(
  batches: readonly T[],
  activeFlowId: string | null
): FlowOwnershipSplit<T> {
  const out: FlowOwnershipSplit<T> = { currentWeek: [], pastDebt: [], released: [] }

  for (const batch of batches) {
    if (batch.status === 'archived' || batch.status === 'cancelled') {
      out.released.push(batch)
      continue
    }
    // AKTİF AKIŞ YOKKEN HİÇBİR ÖDEV "BU HAFTA" DEĞİLDİR. Haftalık Akış
    // manuel açılır (bu turda doğrulanmış bilinçli tasarım); akış
    // açılmamışken ödevleri güncel hafta saymak, olmayan bir haftayı
    // varmış gibi göstermek olurdu.
    if (activeFlowId && batch.weekly_flow_id === activeFlowId) {
      out.currentWeek.push(batch)
    } else {
      out.pastDebt.push(batch)
    }
  }

  return out
}
