// Öğrenci Genel Bakış özetleri (R5.5).
//
// Amaç: R5'in TAMAMINI ana ekrana yığmak değil; üç sistemin nabzını
// göstermek ve detay ekranlarına geçiş sağlamak.
//
// ============================================================
// §7.2'NİN BİRİNCİ SINIRI ARTIK GEÇERSİZ (R7 / Site Testi 01-02)
// ============================================================
// R5.5 burada şunu yazıyordu: *"Ana ekran YORUMLAYICI RİSK/SAĞLIK/DÜZEN
// PUANI ÜRETMEZ."* R7/01 §7 tam tersini şart koşuyor — *"Öğretmen elle
// 'Yolunda / Geride' seçmeyecek. Sistem dört veri kümesini birlikte
// okuyacak"* — ve R7/02 §2 ders bazında "planla uyumlu / geride / önde"
// yorumunu istiyor.
//
// Sınır bilinçle kaldırıldı; kaldırıldığı DOKUMANTASYON.md §8'e de
// yazıldı. Sessizce silinseydi altı ay sonra hangi kuralın geçerli
// olduğunu kimse bilemezdi.
//
// YORUM NEREDE ÜRETİLİR: öğrenci seviyesindeki triyaj etiketi
// `lib/student-status.ts`'te, haftalık tempo bandı
// `lib/weekly-flow.ts`'te. Bu dosya yalnız DERS BAZINDAKİ zamansal
// yorumu üretir (`summarizeAcademicFlowByScope`) — üçü ayrı sorular.
//
// İKİNCİ SINIR AYNEN DURUYOR:
//   R5 verisi olmayan öğrencide ekran KIRILMAZ. Her özet boş girdiyle
//   çağrılabilir ve nötr bir sonuç döner.

import { deriveFlowStatus, type FlowItem, type FlowStatus } from '@/lib/curriculum-flow'
import { todayDateString } from '@/lib/homework-status'

// ============================================================
// Akademik Akış özeti
// ============================================================

export interface FlowSummaryItem {
  topicId: string
  topicName: string
  scopeId: string
  scopeName: string
  startDate: string
  endDate: string
  passed: boolean
}

export interface AcademicFlowSummary {
  /** Şu an zamanı gelmiş konu (birden fazlaysa en erken başlayan). */
  current: FlowSummaryItem | null
  /** Sıradaki yaklaşan konu. */
  upcoming: FlowSummaryItem | null
  /** Özetin hangi ders üzerinden gösterildiği. */
  scopeId: string | null
  scopeName: string | null
  /** Birden fazla ders akışı varsa arayüz bunu belirtir. */
  otherScopeCount: number
}

function statusOf(item: FlowSummaryItem, today: string): FlowStatus {
  const asFlowItem: FlowItem = {
    id: null,
    topicId: item.topicId,
    name: item.topicName,
    startDate: item.startDate,
    endDate: item.endDate,
    passed: item.passed,
    note: null,
  }
  return deriveFlowStatus(asFlowItem, today)
}

/**
 * Akademik Akış kartı: şu anki konu + yaklaşan konu.
 *
 * GEÇİLDİ KONULAR ÖZETİ DOLDURMAZ (§7.1): merkezî akışta geride kalmış
 * bir konu "şu an çalışılan" değildir. Onların yeri Koruma Havuzu'dur.
 *
 * ÇOK SCOPE: ana ekran bütün programı göstermeye ÇALIŞMAZ (§7.1, OG-08).
 * Tek bir ders seçilir — zamanı gelmiş konusu olan ders önceliklidir,
 * yoksa en yakın başlayacak ders. Diğerlerinin sayısı ayrıca belirtilir
 * ki eğitmen eksik bilgiye baktığını bilsin.
 */
export function summarizeAcademicFlow(
  items: FlowSummaryItem[],
  today?: string
): AcademicFlowSummary {
  const day = today ?? todayDateString()
  const empty: AcademicFlowSummary = {
    current: null,
    upcoming: null,
    scopeId: null,
    scopeName: null,
    otherScopeCount: 0,
  }

  if (items.length === 0) return empty

  const active = items.filter(i => statusOf(i, day) === 'current')
  const upcoming = items.filter(i => statusOf(i, day) === 'later')

  // Odaklanılacak ders: zamanı gelmiş konusu olan; yoksa en yakın başlayan.
  const byStart = (a: FlowSummaryItem, b: FlowSummaryItem) =>
    a.startDate.localeCompare(b.startDate)

  const anchor =
    [...active].sort(byStart)[0] ?? [...upcoming].sort(byStart)[0] ?? null

  if (!anchor) return empty

  const scopeId = anchor.scopeId
  const scopeItems = items.filter(i => i.scopeId === scopeId)
  const scopeActive = scopeItems.filter(i => statusOf(i, day) === 'current').sort(byStart)
  const scopeUpcoming = scopeItems.filter(i => statusOf(i, day) === 'later').sort(byStart)

  const allScopes = new Set(items.map(i => i.scopeId))

  return {
    current: scopeActive[0] ?? null,
    upcoming: scopeUpcoming[0] ?? null,
    scopeId,
    scopeName: anchor.scopeName,
    otherScopeCount: Math.max(0, allScopes.size - 1),
  }
}

// ============================================================
// Akademik Akış — DERS BAZINDA (R7 / Site Testi 02 §2)
// ============================================================

export interface FlowScopeSummary {
  scopeId: string
  scopeName: string
  /** Tamamlanmış SON konu. */
  previous: FlowSummaryItem | null
  /** Şu an işlenen konu = tamamlanmamış İLK konu. */
  current: FlowSummaryItem | null
  /** Onun ardındaki konu. */
  next: FlowSummaryItem | null
  /**
   * Zamansal fark, HAFTA cinsinden.
   *   0        planla uyumlu — bugün konunun planlanan aralığında
   *   negatif  geride — planlanan bitiş geçmiş, konu hâlâ açık
   *   pozitif  önde   — konu planlanan başlangıcından erken işleniyor
   *   null     ölçülemiyor (işlenen konu yok, hepsi tamamlanmış)
   */
  weeksDelta: number | null
}

const DAY_MS = 86_400_000

/**
 * Her ders için akademik fotoğraf.
 *
 * ============================================================
 * NEDEN summarizeAcademicFlow'UN YERİNE GEÇİYOR
 * ============================================================
 * Eski özet TEK ders döndürüyordu (R5.5 §7.1: *"ana ekran bütün
 * programı göstermeye çalışmaz"*) ve diğerlerini yalnız sayıyordu:
 * "AYT Matematik · +2 ders daha". R7/02 §2 bu sınırı kaldırıyor —
 * *"7 dersin tamamı gösterilir"*, çünkü öğretmenin sorusu "bu öğrenci
 * HER derste akademik olarak nerede?" ve tek ders bu sorunun yedide
 * birini cevaplıyordu.
 *
 * ============================================================
 * ZAMAN İLE GERÇEK DURUM AYRI (§2 "Veri mantığı")
 * ============================================================
 *   Gerçek akademik durum — Tamamlandı kararı ÖĞRETMENE aittir.
 *     Bu yüzden "işlenen konu" = tamamlanmamış ilk konudur; tarihe
 *     bakılmaz. Planlanan bitişin geçmesi bir konuyu tamamlamaz
 *     (lib/curriculum-flow.ts'in MA-08 garantisiyle aynı ilke).
 *
 *   Zamansal durum — planla uyumlu / önde / geride YORUMU.
 *     Ölçüt: o tarihte işleniyor OLMASI GEREKEN konu ile gerçekten
 *     işlenen konunun başlangıç tarihleri arasındaki fark.
 *
 * İkisi tek alanda birleştirilseydi "tamamlandı" ile "zamanı geçti"
 * aynı şey sayılırdı; oysa biri öğretmenin kararı, diğeri takvimin.
 */
export function summarizeAcademicFlowByScope(
  items: FlowSummaryItem[],
  today?: string
): FlowScopeSummary[] {
  const day = today ?? todayDateString()

  const byScope = new Map<string, FlowSummaryItem[]>()
  for (const item of items) {
    const list = byScope.get(item.scopeId) ?? []
    list.push(item)
    byScope.set(item.scopeId, list)
  }

  const out: FlowScopeSummary[] = []

  for (const [scopeId, raw] of byScope) {
    const sorted = [...raw].sort((a, b) => a.startDate.localeCompare(b.startDate))

    const currentIndex = sorted.findIndex(i => !i.passed)
    const current = currentIndex === -1 ? null : sorted[currentIndex]
    const next = currentIndex === -1 ? null : (sorted[currentIndex + 1] ?? null)

    // Tamamlanmış SON konu — sıradaki değil, geride bırakılan.
    const previous =
      currentIndex === -1
        ? (sorted[sorted.length - 1] ?? null)
        : (sorted.slice(0, currentIndex).filter(i => i.passed).pop() ?? null)

    // ZAMANSAL DURUM, KONUNUN KENDİ PENCERESİNE GÖRE ÖLÇÜLÜR.
    //
    // Belgenin ifadesi: *"Planlanan BAŞLANGIÇ-BİTİŞ haftasına göre
    // planla uyumlu, önde veya geride yorumu."* Yani ölçüt tek bir
    // tarih değil, konunun planlanmış aralığı:
    //
    //   bugün pencerenin İÇİNDE  → planla uyumlu (0)
    //   bugün bitişten SONRA     → geride  (negatif)
    //   bugün başlangıçtan ÖNCE  → önde    (pozitif)
    //
    // Yuvarlama bilinçli olarak `round`: planlanan bitişi iki gün aşmış
    // bir konuya "1 hafta geride" demek, küçük kaymaları haftalık bir
    // gecikme gibi göstererek sinyali gürültüye çevirirdi.
    let weeksDelta: number | null = null
    if (current) {
      const todayMs = new Date(`${day}T00:00:00Z`).getTime()
      const startMs = new Date(`${current.startDate}T00:00:00Z`).getTime()
      const endMs = new Date(`${current.endDate}T00:00:00Z`).getTime()

      const offsetDays =
        todayMs < startMs
          ? (startMs - todayMs) / DAY_MS // önde
          : todayMs > endMs
            ? -((todayMs - endMs) / DAY_MS) // geride
            : 0

      // `|| 0`: Math.round(-0.28) JavaScript'te -0 döndürür. Etiket
      // üretiminde zararsız (-0 === 0) ama testte ve serileştirmede
      // 0'dan ayrı bir değer gibi davranır; burada normalleştiriliyor.
      weeksDelta = Math.round(offsetDays / 7) || 0
    }

    out.push({
      scopeId,
      scopeName: raw[0].scopeName,
      previous,
      current,
      next,
      weeksDelta,
    })
  }

  // Ders adına göre sabit sıra: Genel Bakış bir TRİYAJ değil FOTOĞRAF
  // (§2 "minimalist"). Riske göre sıralamak, her açılışta dersleri yer
  // değiştirtip öğretmenin göz hafızasını bozardı.
  return out.sort((a, b) => a.scopeName.localeCompare(b.scopeName, 'tr'))
}

/** "Planla uyumlu" / "1 hafta geride" / "2 hafta önde" (§2 alt sinyal). */
export function flowDeltaLabel(weeksDelta: number | null): string | null {
  if (weeksDelta === null) return null
  if (weeksDelta === 0) return 'Planla uyumlu'
  const weeks = Math.abs(weeksDelta)
  return weeksDelta < 0 ? `${weeks} hafta geride` : `${weeks} hafta önde`
}

// ============================================================
// Kaynak Planı özeti
// ============================================================

export interface ResourceSummaryItem {
  bookId: string
  title: string
  /** pending | active | completed (R5.1 Kitap Durumu). */
  group: 'active' | 'pending' | 'completed'
  /** Hedef kapsamındaki tamamlanma yüzdesi — ANA gösterge. */
  planPercentage: number
  /** Kitabın fiziksel kapsamı — ikinci seviye bilgi. */
  bookPercentage: number
  /**
   * Aşağıdakiler yalnız SUNUM içindir ve hepsi opsiyoneldir: özet
   * fonksiyonlarının hesabına girmezler. Genel Bakış'taki kaynak tablosu
   * (Tür/Rol · Seçili kapsam) bunlarla dolar; verilmezlerse tablo o
   * hücreleri boş bırakır ve hiçbir şey kırılmaz.
   */
  role?: string | null
  /** "156 test" / "32 sayfa" — kapsamdaki birim sayısı, birimiyle. */
  scopeLabel?: string
  /** DB durumu; rozet etiketi lib/resource-plan.ts'ten türetilir. */
  status?: string | null
  /**
   * ANA KAYNAK MI? (R7/02 §3: *"Ana kaynaklar uyarılarda
   * önceliklidir."*) Otuz kaynağı olan bir öğrencide "3 kaynak geride"
   * cümlesi tek başına bir şey söylemez; hangi üçü olduğu söyler.
   */
  isMain?: boolean
  /**
   * Plan temposu — `calculatePlanPace` çıktısı (lib/plan-pace.ts).
   * Hesap BURADA yapılmıyor: aynı kural Kaynak Planı ekranında da
   * kullanılıyor ve iki yerde ayrı yazılsaydı aynı kaynak iki ekranda
   * farklı tempo gösterirdi.
   */
  paceKey?: 'ahead' | 'on_track' | 'behind' | 'no_target' | 'not_started'
  /**
   * Bu kaynakta MÜFREDAT BİRİKMESİ var mı? (§3 "hafif hesap")
   *
   * Ölçüt kitabın ham içeriği DEĞİL — belge açıkça uyarıyor: *"Bir
   * konuda kitapta 12 test olması, öğretmenin 12 testin tamamını
   * istemesi anlamına gelmez."* Bu yüzden girdi, öğretmenin gerçekten
   * VERDİĞİ ve hâlâ açık duran iş.
   */
  hasCurriculumBacklog?: boolean
}

export interface ResourcePlanSummary {
  activeCount: number
  pendingCount: number
  completedCount: number
  /** Aktif kaynakların ortalama Plan %'si. Aktif kaynak yoksa null. */
  averagePlanPercentage: number | null
  /** Kartta gösterilecek birkaç aktif kaynak. */
  topActive: ResourceSummaryItem[]

  // ---- R7/02 §3: "kaynak sistemi sağlıklı mı?" ----

  /** Aktif kaynakların kaçı ana kaynak. */
  mainCount: number
  /** Plan temposu dağılımı — yalnız AKTİF kaynaklar üzerinden. */
  pace: { onTrack: number; behind: number; notStarted: number }
  /** Planın gerisindeki ANA kaynak sayısı ("2 / 6 ana kaynak geride"). */
  mainBehindCount: number
  /** Müfredat birikmesi olan ana kaynak sayısı. */
  mainBacklogCount: number
}

/**
 * Kaynak Planı kartı.
 *
 * ÖNCELİKLİ YÜZDE PLAN TAMAMLANMASIDIR (§7.1, OG-04). Kitap % detay
 * ekranında ikinci seviyede kalır; ana kartta karar verici sayı Plan
 * %'dir. 276/276 hedef tamamlanmışsa kart %100 der — kitabın yalnız
 * %66'sı bitmiş olsa bile, çünkü PLAN bitmiştir.
 */
export function summarizeResourcePlan(
  items: ResourceSummaryItem[],
  limit = 3
): ResourcePlanSummary {
  const active = items.filter(i => i.group === 'active')

  const averagePlanPercentage =
    active.length === 0
      ? null
      : Math.round(active.reduce((sum, i) => sum + i.planPercentage, 0) / active.length)

  // TAMAMLANANLAR SAĞLIK HESABINDAN ÇIKAR (§3): bitmiş bir kaynak ne
  // geride kalabilir ne de birikme üretir; toplama katılsaydı otuz
  // kaynaklı bir öğrencide "çoğu uyumlu" cümlesi biten kitapların
  // sayesinde doğru görünürdü.
  const mains = active.filter(i => i.isMain)

  return {
    activeCount: active.length,
    pendingCount: items.filter(i => i.group === 'pending').length,
    completedCount: items.filter(i => i.group === 'completed').length,
    averagePlanPercentage,
    // En düşük ilerlemeli aktif kaynaklar önce: dikkat gereken yer orası.
    topActive: [...active]
      .sort((a, b) => a.planPercentage - b.planPercentage)
      .slice(0, limit),

    mainCount: mains.length,
    pace: {
      onTrack: active.filter(i => i.paceKey === 'on_track' || i.paceKey === 'ahead').length,
      behind: active.filter(i => i.paceKey === 'behind').length,
      // 'no_target' de buraya düşer: hedef tarihi olmayan kaynağın
      // temposu ölçülemez ve "uyumlu" saymak, kurulmamış bir planı
      // kurulmuş göstermek olurdu.
      notStarted: active.filter(
        i => i.paceKey === 'not_started' || i.paceKey === 'no_target' || !i.paceKey
      ).length,
    },
    mainBehindCount: mains.filter(i => i.paceKey === 'behind').length,
    mainBacklogCount: mains.filter(i => i.hasCurriculumBacklog).length,
  }
}

// ============================================================
// Koruma Havuzu özeti
// ============================================================

export interface PoolSummaryItem {
  topicId: string
  topicName: string
  daysSinceContact: number
}

/**
 * Koruma Havuzu kartı: yalnız EN ESKİ 2-3 konu (§7.1, OG-06).
 *
 * Havuzda 8 konu olsa da ana ekran hepsini listelemez; kart bir nabız
 * göstergesidir, liste değil. Tamamı detay ekranında.
 */
export function summarizeProtectionPool(
  items: PoolSummaryItem[],
  limit = 3
): { top: PoolSummaryItem[]; total: number } {
  return {
    top: items.slice(0, limit),
    total: items.length,
  }
}

// ============================================================
// Son Akademik İz (Genel Bakış zaman çizgisi)
//
// "Geçen hafta ne oldu, nerede kaldık?" sorusunun tek bakışta cevabı.
// R6-07'nin akademik notu bu sorunun BİR parçasıydı; öğretmenin gerçekte
// hatırlamak istediği şey notlarla birlikte SON ÇALIŞMALARDIR.
//
// YENİ VERİ YOK: girdiler Genel Bakış sayfasının zaten çektiği kümelerden
// gelir (academic_notes + homework_batches). Bu fonksiyon yalnız ikisini
// tek bir zaman çizgisinde birleştirir ve sıralar.
//
// YORUM ÜRETMEZ (§7.2): "geride kalmış", "iyi gidiyor" gibi bir yargı
// yoktur; yalnız ne olduğu ve ne zaman olduğu yazar.
// ============================================================

export type TrailKind = 'note' | 'homework'

export interface TrailEntry {
  id: string
  kind: TrailKind
  /** ISO tarih (YYYY-MM-DD veya tam zaman damgası). */
  date: string
  text: string
  /** İkincil bağlam: ödevde kaynak sayısı, notta yazar adı. */
  detail?: string | null
}

export interface TrailInput {
  /**
   * `note_text` BİLİNÇLİ OLARAK YOK.
   *
   * Fonksiyon notun metnini parametre olarak bile almıyor; alsaydı bir
   * gün birinin onu tekrar ekrana basması an meselesi olurdu. Aynı
   * koruma `noticeSignal` (lib/student-status.ts) için de geçerli.
   */
  notes: { id: string; pinned: boolean; created_at: string; author_name?: string | null }[]
  homework: {
    id: string
    title: string | null
    due_date: string
    itemCount: number
    completedCount: number
  }[]
}

/**
 * İki kaynağı birleştirip en yeniden eskiye sıralar.
 *
 * `limit` varsayılan 6: bu bir arşiv değil, dersin başında bakılacak kısa
 * bir hafıza şerididir. Tamamı ilgili sekmelerde zaten var.
 */
export function buildAcademicTrail(input: TrailInput, limit = 6): TrailEntry[] {
  const entries: TrailEntry[] = [
    // NOTUN METNİ BURAYA GİRMEZ — YALNIZ OLAY (R7/02 §4).
    //
    // Bu satır daha önce `note.note_text`'i doğrudan basıyordu ve
    // Genel Bakış'tan not içeriğini kaldıran kararı ARKA KAPIDAN
    // geçersiz kılıyordu: kart "Not var" derken hemen altındaki Son
    // Akademik İz notun kendisini yazıyordu.
    //
    // Belge bu bloğu zaten olay kaydı olarak tanımlıyor: *"Akademik İz
    // yorum değil, sistemde gerçekleşen olay kaydıdır"* — örnekleri
    // "8 çalışma teslim edildi", "Polinomlar 'İşleniyor' oldu",
    // "Haftalık plan yayınlandı". Hiçbiri bir metin alıntısı değil.
    ...input.notes.map(note => ({
      id: `note-${note.id}`,
      kind: 'note' as const,
      date: note.created_at,
      text: note.pinned ? 'Önemli akademik not eklendi' : 'Akademik not eklendi',
      detail: note.author_name ?? null,
    })),
    ...input.homework.map(batch => ({
      id: `hw-${batch.id}`,
      kind: 'homework' as const,
      date: batch.due_date,
      text: batch.title?.trim() || 'Haftalık plan',
      detail: `${batch.completedCount}/${batch.itemCount} tamamlandı`,
    })),
  ]

  return entries
    .filter(entry => !Number.isNaN(Date.parse(entry.date)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, limit)
}

// ============================================================
// Bu Hafta Odak
//
// Mockup'ta bir "hedef listesi" var. Sistem hedef UYDURMAZ: buradaki
// maddelerin hepsi MEVCUT sinyallerden türer (onay bekleyen, süresi geçen,
// koruma havuzunun en eski konusu, plan ilerlemesi düşük kaynak). Hiçbir
// sinyal yoksa liste boş döner ve arayüz bloğu hiç göstermez — sistem
// gereksiz görev üretmemelidir (R6-07 kabul #49 ile aynı ilke).
// ============================================================

export interface FocusItem {
  id: string
  text: string
  href?: string
}

export function buildWeeklyFocus(input: {
  studentId: string
  pendingApproval: number
  overdue: number
  pool: { top: PoolSummaryItem[] }
  resources: ResourcePlanSummary
}): FocusItem[] {
  const { studentId, pendingApproval, overdue, pool, resources } = input
  const items: FocusItem[] = []

  if (overdue > 0) {
    items.push({
      id: 'overdue',
      text: `${overdue} çalışmanın süresi geçti`,
      href: `/teacher/tasks?filter=overdue&student=${studentId}`,
    })
  }

  if (pendingApproval > 0) {
    items.push({
      id: 'approval',
      text: `${pendingApproval} çalışma onay bekliyor`,
      href: `/teacher/tasks?filter=approval&student=${studentId}`,
    })
  }

  const oldest = pool.top[0]
  if (oldest) {
    items.push({
      id: `pool-${oldest.topicId}`,
      text: `${oldest.topicName} ${oldest.daysSinceContact} gündür temas edilmedi`,
      href: `/teacher/students/${studentId}/protection`,
    })
  }

  const slowest = resources.topActive[0]
  if (slowest) {
    items.push({
      id: `resource-${slowest.bookId}`,
      text: `${slowest.title} planında %${slowest.planPercentage}`,
      href: `/teacher/students/${studentId}/books/${slowest.bookId}`,
    })
  }

  return items
}
