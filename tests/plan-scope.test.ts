import { describe, it, expect } from 'vitest'
import { resolvePlanScope, sectionPageProgress, sectionScopeLabel,
  resolveInterimScope,
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
    note: null,
    videoUrl: null,
  }
}

function book(sections: BookMapSection[], overrides: Partial<BookMapBook> = {}): BookMapBook {
  const totalTests = sections.reduce((n, s) => n + s.tests.length, 0)
  return {
    assignmentId: 'a1',
    bookId: 'b1',
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

  it('bölüm kapsamı yalnız seçili bölümü sayar', () => {
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
    expect(scope.totalUnits).toBe(2)
    expect(scope.completedUnits).toBe(1)
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
