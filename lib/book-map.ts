// Kitap Haritası veri yükleyicisi (R3 v2 §A).
//
// Kural: Bir öğrencinin kitaplarındaki test durumlarını okuyan TEK yer burasıdır.
// Öğrenci-kitap sayfası ve Ödev Ver/Harita ekranı aynı yükleyiciyi kullanır;
// ikinci bir "harita durumu" veri seti oluşturulmaz (R3 v2 §5). Durum türetmesi
// lib/homework-status.ts'e delege edilir — renkler yalnız o durumların görsel
// karşılığıdır.

import {
  deriveTestState,
  todayDateString,
  type HomeworkTestState,
} from '@/lib/homework-status'
import {
  buildCurriculumIndex,
  sectionCurriculumStatus,
} from '@/lib/curriculum-signal'
import type { FlowStatus } from '@/lib/curriculum-flow'
import { formatPageRangeLabel, formatRanges, rangesFromPages } from '@/lib/page-ranges'

export interface BookMapTest {
  id: string
  title: string
  orderIndex: number
  state: HomeworkTestState
  /** Açık ödev kaydı varsa id'si — tekil onay/red işlemleri için. */
  homeworkItemId: string | null
  /** Sayfa takipli kitapta birim tek bir fiziksel sayfadır (022):
   *  pageStart === pageEnd === sayfa no. Test kitabında null. */
  pageStart: number | null
  pageEnd: number | null
}

export interface BookMapSection {
  id: string
  title: string
  orderIndex: number
  tests: BookMapTest[]
  completedCount: number
  /** R6-17: opsiyonel fasikül ve tema etiketleri. Takip birimi değil,
   *  üst grup metadata'sıdır; boş olabilir ve klasik kitaplarda boştur. */
  groupLabel: string | null
  themeLabel: string | null
  /**
   * R5.3: bölümün bağlandığı canonical topic. Eşlemesi olmayan bölümde
   * null'dır ve o bölüm müfredat sinyali almaz — R4 davranışı bozulmaz.
   */
  topicId: string | null
  /**
   * R5.3: öğrencinin kişisel akışına göre bu konunun müfredat durumu.
   * null = eşleme yok, akışta yok ya da akış hiç atanmamış.
   *
   * SALT GÖRSELDİR: ödev oluşturmaz, kitabı Aktif yapmaz, hedef kapsamı
   * değiştirmez, temas üretmez (§5.5).
   */
  curriculumStatus: FlowStatus | null
  /** R4 §3: bölümün fiziksel kapsamı ve kısa insan notu. */
  pageStart: number | null
  pageEnd: number | null
  note: string | null
  videoUrl: string | null
}

/**
 * Hedef türü (R6-04).
 *
 *   resource — Kaynak Hedefi: nihai kapsam + nihai tarih. ANA TEMPO her
 *              zaman bundan hesaplanır.
 *   interim  — Ara Hedef: kısa menzilli, değiştirilebilir. Kaynak Hedefinin
 *              kapsamını veya tarihini asla değiştirmez.
 */
export type BookMapTargetKind = 'resource' | 'interim'

/** Öğrenci-kitap ilişkisindeki aktif hedef (022). Kapsam daraltıldığında
 *  plan matematiği yalnız bu kümeden beslenir — bkz. lib/plan-scope.ts. */
export interface BookMapTarget {
  id: string
  kind: BookMapTargetKind
  startDate: string | null
  targetDate: string | null
  scopeType: 'whole_book' | 'sections' | 'units'
  sectionIds: string[]
  unitIds: string[]
}

export interface BookMapBook {
  assignmentId: string
  bookId: string
  title: string
  subject: string | null
  /** Eski dar sınav alanı. R6-16: GÖRÜNTÜLEMEDE levelExam tercih edilir;
   *  bu alan yalnız geriye dönük fallback'tir. */
  examType: string | null
  /** Canonical seviye/sınav değeri (021: books.level_exam). */
  levelExam: string | null
  /** Öğretim programı (R6-14). */
  curriculumProgram: string | null
  publisher: string | null
  trackingMode: string
  startDate: string | null
  targetEndDate: string | null
  sections: BookMapSection[]
  totalTests: number
  completedTests: number
  /** Bir bölümdeki en yüksek test sayısı — matrisin sütun genişliği. */
  maxTestsPerSection: number
  videoMode: string
  videoUrl: string | null
  /** 'resource': yalnız kaynak olarak göster. 'weekly_reminder': haftalık
   *  plan mesajında da hatırlat (R4 §6). */
  videoDisplay: string
  /** Tek aktif hedef; yoksa null (o zaman kapsam tüm kitaptır). */
  /**
   * Kitap Durumu (R5.1): pending=Bekliyor, active=Aktif,
   * completed=Hedef Tamamlandı. paused/archived geriye dönük değerlerdir.
   */
  status: string
  /**
   * Kaynağın bu öğrencinin planındaki rolü (R5.1). Kitabın değil
   * öğrenci-kitap ilişkisinin özelliğidir; hiçbir hesaba girmez.
   */
  role: string | null
  /** Kaynak Hedefi — ana tempo bundan hesaplanır (R6-04). */
  target: BookMapTarget | null
  /** Ara Hedef — varsa kısa menzilli plan. Ana tempoyu etkilemez. */
  interimTarget: BookMapTarget | null
}

interface LoadBookMapArgs {
  workspaceId: string
  studentId: string
  /** Verilirse yalnız bu kitaplar yüklenir; verilmezse tüm atamalar. */
  bookIds?: string[]
  /**
   * Yüklenecek atama durumları (R5.1). Varsayılan yalnız 'active' —
   * bugünkü tüm çağıranlar (Kitap Haritası, ödev verme, veli/öğrenci
   * ekranları) yalnız aktif kaynakla ilgileniyor ve davranışları
   * değişmemeli. Kaynak Planı ekranı Bekliyor/Tamamlandı gruplarını da
   * göstermek için bunu genişletir.
   */
  statuses?: string[]
  /** Test edilebilirlik için enjekte edilebilir. */
  today?: Date
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type SupabaseLike = any

/**
 * Öğrencinin aktif kitap atamalarını, bölüm/test ağacıyla ve her testin tek
 * aktif durumuyla birlikte döner.
 *
 * `homework_batches.due_date` bilinçli olarak join edilir: teslim tarihi
 * olmadan "süresi geçen" durumu türetilemez (eski tek-kitap sayfası bu yüzden
 * overdue'yu hiç gösteremiyordu).
 */
export async function loadBookMap(
  supabase: SupabaseLike,
  { workspaceId, studentId, bookIds, statuses, today }: LoadBookMapArgs
): Promise<BookMapBook[]> {
  let assignmentQuery = supabase
    .from('student_book_assignments')
    .select(`
      id, book_id, start_date, target_end_date, video_display, status, role,
      books(
        id, title, subject, exam_type, level_exam, curriculum_program,
        publisher, tracking_mode, video_mode, video_url,
        book_sections(
          id, title, order_index, status, note, video_url, page_start, page_end,
          group_label, theme_label, topic_id,
          book_tests(id, title, order_index, status, page_start, page_end)
        )
      )
    `)
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .in('status', statuses ?? ['active'])

  if (bookIds?.length) {
    assignmentQuery = assignmentQuery.in('book_id', bookIds)
  }

  const { data: assignments } = await assignmentQuery
  const rows = (assignments ?? []) as any[]
  if (rows.length === 0) return []

  const assignmentIds = rows.map((a) => a.id)

  // Üç sorgu da assignmentIds'e bağlı ama BİRBİRİNDEN bağımsız; sıralı
  // beklemek için sebep yok. Tek dalgada çalışırlar, sonuçlar aynıdır.
  const [
    { data: openItems },
    { data: completions },
    { data: targets },
    { data: curriculumRows },
  ] = await Promise.all([
    // Açık ödev kayıtları + ait oldukları batch'in teslim tarihi.
    supabase
      .from('homework_items')
      .select(
        'id, book_test_id, status, rejected_at, homework_batches!inner(due_date, status)'
      )
      .in('student_book_assignment_id', assignmentIds)
      .in('status', ['pending', 'pending_approval'])
      .eq('homework_batches.status', 'active'),
    // Onaylanmış ilerleme (resmi kayıt).
    supabase
      .from('test_completions')
      .select('book_test_id')
      .in('student_book_assignment_id', assignmentIds)
      .eq('status', 'active'),
    // Aktif hedefler (022 + 029). Tür başına en fazla bir aktif satır:
    // Kaynak Hedefi ve Ara Hedef aynı anda var olabilir.
    // Hedef yoksa kapsam tüm kitaptır.
    supabase
      .from('student_book_targets')
      .select(
        'id, student_book_assignment_id, start_date, target_date, scope_type, scope_data, kind'
      )
      .in('student_book_assignment_id', assignmentIds)
      .eq('active', true),
    // R5.3: öğrencinin kişisel müfredat akışı. Sinyal BU tablodan gelir;
    // kitabın kendi verisinden değil. Aynı kitabı iki öğrenci çalışırken
    // sinyalleri farklı olabilir — akış kişiseldir.
    supabase
      .from('student_curriculum_items')
      .select('topic_id, start_date, passed_at')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId),
  ])

  // Sinyal ve ödev durumu AYNI takvim gününü görmeli; ikisi de
  // Europe/Istanbul'a sabitli tek helper'dan besleniyor.
  const todayStr = todayDateString(today)

  const curriculumByTopic = buildCurriculumIndex(
    (curriculumRows ?? []) as { topic_id: string | null; start_date: string; passed_at: string | null }[]
  )

  const completedIds = new Set<string>(
    ((completions ?? []) as any[]).map((c) => c.book_test_id)
  )

  const targetByAssignment = new Map<string, BookMapTarget>()
  const interimByAssignment = new Map<string, BookMapTarget>()
  for (const row of (targets ?? []) as any[]) {
    // 029 öncesi satırlarda kind kolonu yoktur; onlar Kaynak Hedefidir.
    const kind: BookMapTargetKind = row.kind === 'interim' ? 'interim' : 'resource'
    const target: BookMapTarget = {
      id: row.id,
      kind,
      startDate: row.start_date ?? null,
      targetDate: row.target_date ?? null,
      scopeType: row.scope_type ?? 'whole_book',
      sectionIds: row.scope_data?.section_ids ?? [],
      unitIds: row.scope_data?.unit_ids ?? [],
    }
    const bucket = kind === 'interim' ? interimByAssignment : targetByAssignment
    bucket.set(row.student_book_assignment_id, target)
  }

  const itemByTestId = new Map<string, any>()
  for (const item of (openItems ?? []) as any[]) {
    // Aynı test için birden fazla açık kayıt normalde RPC tarafından
    // engelleniyor; yine de deterministik olmak için ilkini koruyoruz.
    if (!itemByTestId.has(item.book_test_id)) itemByTestId.set(item.book_test_id, item)
  }

  return rows.map((assignment) => {
    const book = assignment.books
    const sections: BookMapSection[] = (book?.book_sections ?? [])
      .filter((s: any) => s.status === 'active')
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((s: any) => {
        const tests: BookMapTest[] = (s.book_tests ?? [])
          .filter((t: any) => t.status === 'active')
          .sort((a: any, b: any) => a.order_index - b.order_index)
          .map((t: any) => {
            const item = itemByTestId.get(t.id)
            return {
              id: t.id,
              title: t.title,
              orderIndex: t.order_index,
              homeworkItemId: item?.id ?? null,
              pageStart: t.page_start ?? null,
              pageEnd: t.page_end ?? null,
              state: deriveTestState({
                hasActiveCompletion: completedIds.has(t.id),
                itemStatus: item?.status ?? null,
                dueDate: item?.homework_batches?.due_date ?? null,
                rejectedAt: item?.rejected_at ?? null,
                today,
              }),
            }
          })
        return {
          id: s.id,
          title: s.title,
          orderIndex: s.order_index,
          tests,
          completedCount: tests.filter((t) => t.state === 'completed').length,
          pageStart: s.page_start ?? null,
          pageEnd: s.page_end ?? null,
          groupLabel: s.group_label ?? null,
          themeLabel: s.theme_label ?? null,
          topicId: s.topic_id ?? null,
          curriculumStatus: sectionCurriculumStatus(
            s.topic_id ?? null,
            curriculumByTopic,
            todayStr
          ),
          note: s.note ?? null,
          videoUrl: s.video_url ?? null,
        }
      })
      .filter((s: BookMapSection) => s.tests.length > 0)

    const totalTests = sections.reduce((sum, s) => sum + s.tests.length, 0)

    return {
      assignmentId: assignment.id,
      bookId: assignment.book_id,
      status: assignment.status ?? 'active',
      role: assignment.role ?? null,
      title: book?.title ?? '',
      subject: book?.subject ?? null,
      examType: book?.exam_type ?? null,
      levelExam: book?.level_exam ?? null,
      curriculumProgram: book?.curriculum_program ?? null,
      publisher: book?.publisher ?? null,
      trackingMode: book?.tracking_mode ?? 'test',
      startDate: assignment.start_date ?? null,
      targetEndDate: assignment.target_end_date ?? null,
      sections,
      totalTests,
      completedTests: sections.reduce((sum, s) => sum + s.completedCount, 0),
      maxTestsPerSection: sections.reduce((max, s) => Math.max(max, s.tests.length), 0),
      videoMode: book?.video_mode ?? 'none',
      videoUrl: book?.video_url ?? null,
      videoDisplay: assignment.video_display ?? 'resource',
      target: targetByAssignment.get(assignment.id) ?? null,
      interimTarget: interimByAssignment.get(assignment.id) ?? null,
    }
  })
}

/**
 * Kaynak Haritasının iki çalışma modu (R6-03).
 *
 *   plan   — "Bu Haftanın Planı" sepetini doldurma. Bugünkü davranış.
 *   manage — Eğitmenin akademik kayıt yönetimi: toplu tamamlandı işleme,
 *            onaylama, tamamlanmayı geri alma.
 *
 * İkisi bilinçli olarak AYRI tutulur. Sepet yalnız "henüz verilmedi"
 * durumundaki birimleri kabul eder; yönetim modu ise gerçek hayattaki her
 * duruma müdahale edebilmelidir. Tek bir seçim listesi iki amaca birden
 * hizmet etseydi, ya sepet bozulur ya yönetim kısıtlı kalırdı.
 */
export type BookMapMode = 'plan' | 'manage'

/**
 * Haritada seçilebilir durumlar.
 *
 * plan modunda: yalnız 'not_assigned'. Tamamlanmış veya halihazırda ödevde
 * olan bir test yeniden atanamaz — create_homework_batch bunu zaten reddeder.
 *
 * manage modunda: 'no_test' dışında hepsi. Seçim TEK BAŞINA hiçbir statüyü
 * değiştirmez; değişiklik yalnız eğitmen bir işlem uyguladığında olur.
 */
export function isSelectableState(
  state: HomeworkTestState,
  mode: BookMapMode = 'plan'
): boolean {
  if (mode === 'manage') return state !== 'no_test'
  return state === 'not_assigned'
}

/**
 * Bir bölümden seçilen birimleri okunur tek satıra çevirir.
 *
 *   [1,2,3]                        -> "1-3. Test"
 *   [5,7,9]                        -> "5, 7, 9. Test"
 *   [1..36, 42..48] + 'page'       -> "sf. 1-36, 42-48"
 *
 * Sayfa takipli kitapta birim tek bir fiziksel sayfadır (022), bu yüzden
 * numaralar sayfa numarasıdır ve aralığa toplanır. Test kitabında da
 * ardışık numaralar sıkıştırılır (R4 §7: "1,2,3,4,5. Test" -> "1-5. Test").
 * Sıkıştırma ve biçimleme lib/page-ranges.ts'te tek yerde durur.
 */
export function formatSelectedUnits(
  orderIndexes: number[],
  trackingMode: string
): string {
  const ranges = rangesFromPages(orderIndexes)
  if (ranges.length === 0) return ''

  if (trackingMode === 'page') return formatPageRangeLabel(ranges)

  return `${formatRanges(ranges)}. Test`
}
