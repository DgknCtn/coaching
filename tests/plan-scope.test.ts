import { describe, it, expect } from 'vitest'
import { resolvePlanScope, sectionPageProgress, sectionScopeLabel,
  resolveInterimScope,
  isSectionInTarget,
} from '@/lib/plan-scope'
import { formatRanges } from '@/lib/page-ranges'
import { calculatePlanTempo } from '@/lib/plan-pace'
import type { BookMapBook, BookMapSection, BookMapTest } from '@/lib/book-map'
import type { HomeworkTestState } from '@/lib/homework-status'

function pageTest(page: number, state: HomeworkTestState): BookMapTest {
  return {
    id: `t${page}`,
    title: `sf. ${page}`,
    orderIndex: page,
    state,
    homeworkItemId: null,
    pageStart: page,
    pageEnd: page,
  }
}

function section(id: string, tests: BookMapTest[], pageStart?: number, pageEnd?: number): BookMapSection {
  return {
    id,
    title: id,
    orderIndex: 1,
    tests,
    completedCount: tests.filter((t) => t.state === 'completed').length,
    pageStart: pageStart ?? null,
    pageEnd: pageEnd ?? null,
    groupLabel: null,
    themeLabel: null,
    topicId: null,
    curriculumStatus: null,
    note: null,
    videoUrl: null,
  }
}

function book(sections: BookMapSection[], overrides: Partial<BookMapBook> = {}): BookMapBook {
  const totalTests = sections.reduce((n, s) => n + s.tests.length, 0)
  return {
    assignmentId: 'a1',
    bookId: 'b1',
    status: 'active',
    role: null,
    title: 'Metin 10. Sınıf Matematik',
    subject: 'Matematik',
    examType: null,
    levelExam: null,
    curriculumProgram: null,
    publisher: null,
    trackingMode: 'page',
    startDate: '2026-09-01',
    targetEndDate: '2026-09-30',
    interimTarget: null,
    sections,
    totalTests,
    completedTests: sections.reduce((n, s) => n + s.completedCount, 0),
    maxTestsPerSection: sections.reduce((n, s) => Math.max(n, s.tests.length), 0),
    videoMode: 'none',
    videoUrl: null,
    videoDisplay: 'resource',
    target: null,
    ...overrides,
  }
}

/** "Üçgenler sf. 1-56"; 1-36 ve 42-48 onaylı -> 43 sayfa. */
function ucgenler(): BookMapSection {
  const tests: BookMapTest[] = []
  for (let p = 1; p <= 56; p++) {
    const approved = (p >= 1 && p <= 36) || (p >= 42 && p <= 48)
    tests.push(pageTest(p, approved ? 'completed' : 'not_assigned'))
  }
  return section('ucgenler', tests, 1, 56)
}

describe('sectionPageProgress (R4 §4)', () => {
  it('43/56 = %77 ve kalan aralıklar 37-41, 49-56', () => {
    const progress = sectionPageProgress(ucgenler())
    expect(progress.totalPages).toBe(56)
    expect(progress.completedPages).toBe(43)
    expect(progress.percentage).toBe(77)
    expect(formatRanges(progress.completedRanges)).toBe('1-36, 42-48')
    expect(formatRanges(progress.remainingRanges)).toBe('37-41, 49-56')
  })

  it('ödevde/onay bekleyen sayfaları ayrı sayar ve tamamlanmışa katmaz', () => {
    const tests = [
      pageTest(1, 'completed'),
      pageTest(2, 'assigned'),
      pageTest(3, 'pending_approval'),
      pageTest(4, 'overdue'),
      pageTest(5, 'not_assigned'),
    ]
    const progress = sectionPageProgress(section('s', tests, 1, 5))
    expect(progress.completedPages).toBe(1)
    expect(progress.inProgressPages).toBe(3)
    expect(formatRanges(progress.remainingRanges)).toBe('2-5')
  })

  it('boş bölümde yüzde 0 döner, sıfıra bölme yok', () => {
    expect(sectionPageProgress(section('bos', [], null as never, null as never)).percentage).toBe(0)
  })

  it('bölüm kapsam etiketi üretir', () => {
    expect(sectionScopeLabel(ucgenler())).toBe('sf. 1-56')
    expect(sectionScopeLabel(section('s', []))).toBe('')
  })
})

describe('resolvePlanScope (R4 §5)', () => {
  const bolumA = section('A', [pageTest(1, 'completed'), pageTest(2, 'not_assigned')], 1, 2)
  const bolumB = section('B', [pageTest(3, 'completed'), pageTest(4, 'not_assigned')], 3, 4)

  it('hedef yoksa kapsam tüm kitaptır', () => {
    const scope = resolvePlanScope(book([bolumA, bolumB]))
    expect(scope.totalUnits).toBe(4)
    expect(scope.completedUnits).toBe(2)
    expect(scope.scopeType).toBe('whole_book')
    expect(scope.label).toBe('Tüm kitap')
  })

  it('bölüm kapsamı seçili bölümü + kapsam dışı tamamlanmışları sayar', () => {
    // R5.1 / KP-03 ile davranış değişti: kapsam daraltmak yalnız YAPILMAMIŞ
    // işi paydadan düşürür. bolumB kapsam dışıdır ama içindeki tamamlanmış
    // sayfa (3) planda kalır; yapılmamış sayfası (4) düşer.
    const scope = resolvePlanScope(
      book([bolumA, bolumB], {
        target: {
          id: 'g1',
          kind: 'resource' as const,
          startDate: '2026-09-01',
          targetDate: '2026-09-30',
          scopeType: 'sections',
          sectionIds: ['A'],
          unitIds: [],
        },
      })
    )
    expect(scope.totalUnits).toBe(3) // A'nın 2 sayfası + B'nin tamamlanmış 1 sayfası
    expect(scope.completedUnits).toBe(2)
  })

  it('birim kapsamı yalnız seçili birimleri sayar', () => {
    const scope = resolvePlanScope(
      book([bolumA, bolumB], {
        target: {
          id: 'g1',
          kind: 'resource' as const,
          startDate: null,
          targetDate: null,
          scopeType: 'units',
          sectionIds: [],
          unitIds: ['t1', 't3', 't4'],
        },
      })
    )
    expect(scope.totalUnits).toBe(3)
    expect(scope.completedUnits).toBe(2)
    // Hedefin kendi tarihi yoksa atamanın tarihleri kullanılır.
    expect(scope.startDate).toBe('2026-09-01')
    expect(scope.targetEndDate).toBe('2026-09-30')
  })

  it('hedefin tarihleri atamanınkinin önüne geçer', () => {
    const scope = resolvePlanScope(
      book([bolumA], {
        target: {
          id: 'g1',
          kind: 'resource' as const,
          startDate: '2026-10-01',
          targetDate: '2026-10-31',
          scopeType: 'whole_book',
          sectionIds: [],
          unitIds: [],
        },
      })
    )
    expect(scope.startDate).toBe('2026-10-01')
    expect(scope.targetEndDate).toBe('2026-10-31')
  })
})

describe('kapsam + mevcut plan matematiği', () => {
  // R4 örnek B: yalnız Üçgenler sf. 1-56, 01.09 - 30.09.2026.
  // Plan matematiği değişmez; yalnız beslendiği T/C daralır.
  it('bölüm hedefinde tempo 56 sayfa üzerinden hesaplanır', () => {
    const scope = resolvePlanScope(
      book([ucgenler()], {
        target: {
          id: 'g1',
          kind: 'resource' as const,
          startDate: '2026-09-01',
          targetDate: '2026-09-30',
          scopeType: 'sections',
          sectionIds: ['ucgenler'],
          unitIds: [],
        },
      })
    )

    const tempo = calculatePlanTempo({
      startDate: scope.startDate,
      targetEndDate: scope.targetEndDate,
      totalUnits: scope.totalUnits,
      completedUnits: scope.completedUnits,
      today: new Date('2026-09-15T12:00:00Z'),
    })

    expect(tempo.totalUnits).toBe(56)
    expect(tempo.completedUnits).toBe(43)
    expect(tempo.remainingUnits).toBe(13)
    expect(tempo.completionPercentage).toBe(77)
    expect(tempo.totalWeeks).toBe(5)
  })
})

// ============================================================
// R6-04: Kaynak Hedefi / Ara Hedef ayrımı (kabul #31-#35)
// ============================================================

describe('resolveInterimScope', () => {
  // Bu blok kendi bölümlerini kurar; yukarıdaki fixture'lar başka bir
  // describe kapsamında tanımlı.
  const bolumA = section('A', [pageTest(1, 'completed'), pageTest(2, 'not_assigned')], 1, 2)
  const bolumB = section('B', [pageTest(3, 'completed'), pageTest(4, 'not_assigned')], 3, 4)

  it('ara hedef yoksa null döner', () => {
    expect(resolveInterimScope(book([bolumA, bolumB]))).toBeNull()
  })

  it('kabul #31: ara hedef Kaynak Hedefinin tarihini değiştirmez', () => {
    const b = book([bolumA, bolumB], {
      target: {
        id: 'kaynak',
        kind: 'resource' as const,
        startDate: '2026-09-01',
        targetDate: '2027-06-01',
        scopeType: 'whole_book',
        sectionIds: [],
        unitIds: [],
      },
      interimTarget: {
        id: 'ara',
        kind: 'interim' as const,
        startDate: '2026-09-01',
        targetDate: '2026-09-15',
        scopeType: 'sections',
        sectionIds: ['A'],
        unitIds: [],
      },
    })

    const resource = resolvePlanScope(b)
    const interim = resolveInterimScope(b)

    expect(resource.targetEndDate).toBe('2027-06-01')
    expect(interim?.targetEndDate).toBe('2026-09-15')
    // Ana kapsam ara hedefin daraltmasından etkilenmez.
    expect(resource.scopeType).toBe('whole_book')
    expect(interim?.scopeType).toBe('sections')
  })

  it('kabul #34: kapsam %100 iken kitap geneli ayrı kalır', () => {
    // bolumA tamamen tamamlanmış, bolumB hiç başlanmamış olsun.
    const done = section(
      'A',
      bolumA.tests.map((t) => ({ ...t, state: 'completed' as const }))
    )
    const b = book([done, bolumB], {
      target: {
        id: 'kaynak',
        kind: 'resource' as const,
        startDate: '2026-09-01',
        targetDate: '2026-09-30',
        scopeType: 'sections',
        sectionIds: ['A'],
        unitIds: [],
      },
    })

    const scope = resolvePlanScope(b)
    expect(scope.percentage).toBe(100)
    expect(scope.bookPercentage).toBeLessThan(100)
    expect(scope.bookTotalUnits).toBe(done.tests.length + bolumB.tests.length)
  })
})

// ============================================================
// R5.1 — Öğrenci Kaynak Planı kabul testleri (KP-01 … KP-08)
//
// İki formül şartnamenin §3.2'sinden:
//   plan_completion = onaylı(hedef kapsam içi) / hedef kapsam toplamı
//   book_coverage   = onaylı(kitapta)         / kitabın takip edilebilir toplamı
// ============================================================

describe('R5.1 · Kaynak Planı kabul testleri', () => {
  /** n testlik bir bölüm; ilk `done` tanesi tamamlanmış. */
  function testSection(id: string, count: number, done = 0): BookMapSection {
    const tests: BookMapTest[] = Array.from({ length: count }, (_, i) => ({
      id: `${id}-${i + 1}`,
      title: `${i + 1}. Test`,
      orderIndex: i + 1,
      state: (i < done ? 'completed' : 'not_assigned') as HomeworkTestState,
      homeworkItemId: null,
      pageStart: null,
      pageEnd: null,
    }))
    return {
      id,
      title: id,
      orderIndex: 1,
      tests,
      completedCount: done,
      groupLabel: null,
      themeLabel: null,
      topicId: null,
      curriculumStatus: null,
      pageStart: null,
      pageEnd: null,
      note: null,
      videoUrl: null,
    }
  }

  function testBook(sections: BookMapSection[], overrides: Partial<BookMapBook> = {}) {
    return book(sections, { trackingMode: 'test', ...overrides })
  }

  const resourceTarget = (over: Partial<NonNullable<BookMapBook['target']>> = {}) => ({
    id: 'hedef',
    kind: 'resource' as const,
    startDate: '2026-09-01',
    targetDate: '2026-12-01',
    scopeType: 'sections' as const,
    sectionIds: [] as string[],
    unitIds: [] as string[],
    ...over,
  })

  it('KP-01: 420 toplam / 276 hedef / 276 onay -> Plan %100, Kitap ~%66', () => {
    // Hedefteki 276'nın tamamı onaylı; kitabın kalan 144 testi hiç yapılmamış.
    const scope = resolvePlanScope(
      testBook([testSection('hedef', 276, 276), testSection('disarida', 144, 0)], {
        target: resourceTarget({ sectionIds: ['hedef'] }),
      })
    )

    expect(scope.totalUnits).toBe(276)
    expect(scope.completedUnits).toBe(276)
    expect(scope.percentage).toBe(100)

    expect(scope.bookTotalUnits).toBe(420)
    expect(scope.bookCompletedUnits).toBe(276)
    expect(scope.bookPercentage).toBe(66) // 276/420 = %65,7 -> 66
  })

  it('KP-02: onay bekleyen plan hesabına girmez', () => {
    // 276 hedef: 230 onaylı, 20 onay bekliyor, 26 hiç başlanmamış.
    const tests: BookMapTest[] = Array.from({ length: 276 }, (_, i) => ({
      id: `t${i}`,
      title: `${i + 1}. Test`,
      orderIndex: i + 1,
      state: (i < 230 ? 'completed' : i < 250 ? 'pending_approval' : 'not_assigned') as HomeworkTestState,
      homeworkItemId: null,
      pageStart: null,
      pageEnd: null,
    }))
    const section: BookMapSection = {
      id: 'hedef',
      title: 'hedef',
      orderIndex: 1,
      tests,
      completedCount: 230,
      groupLabel: null,
      themeLabel: null,
      topicId: null,
      curriculumStatus: null,
      pageStart: null,
      pageEnd: null,
      note: null,
      videoUrl: null,
    }

    const scope = resolvePlanScope(
      testBook([section], { target: resourceTarget({ sectionIds: ['hedef'] }) })
    )

    expect(scope.totalUnits).toBe(276)
    expect(scope.completedUnits).toBe(230) // yalnız onaylı
    expect(scope.percentage).toBe(83) // 230/276

    // Onay bekleyenler ayrı sayılır; plana dahil DEĞİL.
    const pendingApproval = section.tests.filter(t => t.state === 'pending_approval').length
    expect(pendingApproval).toBe(20)
  })

  it('KP-03: 14 testlik bölümde 6 tamam -> Plan Dışı -> 6 kalır, 8 çıkar', () => {
    const bolum = testSection('B', 14, 6)
    const digeri = testSection('A', 10, 0)

    const dahil = resolvePlanScope(
      testBook([digeri, bolum], { target: resourceTarget({ sectionIds: ['A', 'B'] }) })
    )
    expect(dahil.totalUnits).toBe(24) // 10 + 14

    // B plan dışı bırakılır.
    const disarida = resolvePlanScope(
      testBook([digeri, bolum], { target: resourceTarget({ sectionIds: ['A'] }) })
    )

    expect(disarida.totalUnits).toBe(16) // 24 - 8 (yalnız yapılmamışlar çıktı)
    expect(disarida.completedUnits).toBe(6) // 6 geçmişte kaldı ve sayılıyor
    expect(dahil.totalUnits - disarida.totalUnits).toBe(8)
  })

  it('KP-04: hedef kapsam büyütülünce yüzde ve kalan yeniden hesaplanır', () => {
    const a = testSection('A', 276, 138)
    const b = testSection('B', 24, 0)

    const once = resolvePlanScope(
      testBook([a, b], { target: resourceTarget({ sectionIds: ['A'] }) })
    )
    expect(once.totalUnits).toBe(276)
    expect(once.percentage).toBe(50)

    const sonra = resolvePlanScope(
      testBook([a, b], { target: resourceTarget({ sectionIds: ['A', 'B'] }) })
    )
    expect(sonra.totalUnits).toBe(300)
    expect(sonra.completedUnits).toBe(138)
    expect(sonra.percentage).toBe(46) // 138/300
    expect(sonra.totalUnits - sonra.completedUnits).toBe(162) // kalan
  })

  it('KP-05: hedef tarihi değişince haftalık tempo yeniden hesaplanır', () => {
    const girdi = {
      startDate: '2026-09-01',
      totalUnits: 276,
      completedUnits: 76,
      trackingMode: 'test',
      today: new Date('2026-10-01T09:00:00Z'),
    }

    const uzak = calculatePlanTempo({ ...girdi, targetEndDate: '2027-06-01' })
    const yakin = calculatePlanTempo({ ...girdi, targetEndDate: '2026-12-01' })

    expect(uzak.remainingUnits).toBe(200)
    expect(yakin.remainingUnits).toBe(200)
    // Aynı iş, daha kısa süre -> daha yüksek gerekli tempo.
    expect(yakin.requiredPacePerWeek).toBeGreaterThan(uzak.requiredPacePerWeek!)
  })

  it('KP-06: rol değişimi ilerleme verisine dokunmaz', () => {
    // Rol student_book_assignments üzerinde bir meta alandır ve hiçbir
    // hesaba girmez; plan kapsamı yalnız hedeften ve tamamlanmadan türer.
    const sections = [testSection('A', 20, 8)]
    const target = resourceTarget({ sectionIds: ['A'] })

    const pekistirme = resolvePlanScope(testBook(sections, { target }))
    const anaCalisma = resolvePlanScope(testBook(sections, { target }))

    expect(anaCalisma.totalUnits).toBe(pekistirme.totalUnits)
    expect(anaCalisma.completedUnits).toBe(pekistirme.completedUnits)
    expect(anaCalisma.percentage).toBe(pekistirme.percentage)
  })

  it('KP-07: Tam Kitap seçilince tüm takip edilebilir kapsam paydaya girer', () => {
    const scope = resolvePlanScope(
      testBook([testSection('A', 276, 100), testSection('B', 144, 0)], {
        target: resourceTarget({ scopeType: 'whole_book' }),
      })
    )
    expect(scope.totalUnits).toBe(420)
    expect(scope.totalUnits).toBe(scope.bookTotalUnits)
    expect(scope.percentage).toBe(scope.bookPercentage)
  })

  it('KP-08: örtüşen sayfa aralıkları çift sayılmaz', () => {
    // 022'den beri her fiziksel sayfa TEK book_tests satırıdır; aynı sayfa
    // iki farklı ödevde verilse bile tek birimdir. Çift sayım şema
    // düzeyinde imkânsızdır.
    const bolum = section(
      'F1',
      [pageTest(1, 'completed'), pageTest(2, 'completed'), pageTest(3, 'not_assigned')],
      1,
      3
    )
    const scope = resolvePlanScope(book([bolum]))

    expect(scope.totalUnits).toBe(3)
    expect(scope.completedUnits).toBe(2)
    expect(scope.unitIds.size).toBe(3) // Set: aynı birim iki kez giremez
  })
})

// ============================================================
// R5.3 / MK-09 — plan dışı bırakma ve müfredat sinyali birlikte
// ============================================================

describe('R5.3 · MK-09', () => {
  function testSection(id: string, count: number, done = 0): BookMapSection {
    const tests: BookMapTest[] = Array.from({ length: count }, (_, i) => ({
      id: `${id}-${i + 1}`,
      title: `${i + 1}. Test`,
      orderIndex: i + 1,
      state: (i < done ? 'completed' : 'not_assigned') as HomeworkTestState,
      homeworkItemId: null,
      pageStart: null,
      pageEnd: null,
    }))
    return {
      id,
      title: id,
      orderIndex: 1,
      tests,
      completedCount: done,
      groupLabel: null,
      themeLabel: null,
      topicId: `${id}-topic`,
      curriculumStatus: 'current',
      pageStart: null,
      pageEnd: null,
      note: null,
      videoUrl: null,
    }
  }

  const hedef = (sectionIds: string[]) => ({
    id: 'hedef',
    kind: 'resource' as const,
    startDate: '2026-09-01',
    targetDate: '2026-12-01',
    scopeType: 'sections' as const,
    sectionIds,
    unitIds: [] as string[],
  })

  it('14 testlik satırda 6 tamamlandıktan sonra Plan Dışı: 6 korunur, 8 hedeften çıkar', () => {
    const bolum = testSection('B', 14, 6)
    const digeri = testSection('A', 10, 0)
    const kitap = (ids: string[]) =>
      book([digeri, bolum], { trackingMode: 'test', target: hedef(ids) })

    const dahil = resolvePlanScope(kitap(['A', 'B']))
    const disarida = resolvePlanScope(kitap(['A']))

    expect(dahil.totalUnits - disarida.totalUnits).toBe(8)
    expect(disarida.completedUnits).toBe(6)
  })

  it('plan dışı bırakılan bölüm müfredat sinyalini KAYBETMEZ', () => {
    // §5.3 matrisi: "Aktif + Plan Dışı + Zamanı Geldi -> Sinyal ve Plan
    // Dışı aynı anda korunur." İkisi bağımsız eksenlerdir.
    const bolum = testSection('B', 14, 6)
    const kitap = book([bolum], { trackingMode: 'test', target: hedef([]) })

    expect(isSectionInTarget(kitap.sections[0], kitap.target)).toBe(false)
    expect(kitap.sections[0].curriculumStatus).toBe('current')
  })
})
