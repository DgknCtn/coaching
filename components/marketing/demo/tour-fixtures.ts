import type { BookMapBook, BookMapSection, BookMapTest } from '@/lib/book-map'
import type { HomeworkTestState } from '@/lib/homework-status'
import { demoDate } from '@/lib/demo-data'

// ÜRÜN TURU ÖRNEK VERİSİ — landing (product-tour) ve /demo için TEK KAYNAK.
//
// Mockup'lar uygulamanın GERÇEK bileşenleriyle çizilir (BookMapGrid,
// StudentStatusBadge, CalendarBadges); bu dosya onlara gerçek tiplerde
// örnek veri verir. Tip değişirse derleme burada kırılır ve vitrin
// ürünle çelişmeden kalır.
//
// Tarihler GÖRELİ (demoDate): elle yazılmış tarih birkaç ayda bayatlar.
// Adlar kısaltılmış ("Ayşe Y."): örnek olduğu belli olsun.

// --- Kitap Haritası -------------------------------------------------------

/**
 * Satır başına durum dizisi: tüm renkler sayfada en az bir kez görünür.
 * Bölüm başına EN FAZLA 6 test: mockup penceresinin genişliğinde fazlası
 * kesiliyordu (ilk sürümde "Onay Bekliyor" 7-8. sütunda görünmüyordu).
 */
export const MAX_DEMO_TESTS = 6
const SECTION_ROWS: { title: string; states: HomeworkTestState[] }[] = [
  {
    title: 'Denklemler',
    states: ['completed', 'completed', 'completed', 'completed', 'pending_approval', 'pending_approval'],
  },
  {
    title: 'Problemler',
    states: ['completed', 'completed', 'overdue', 'assigned', 'assigned', 'not_assigned'],
  },
  {
    title: 'Oran ve Orantı',
    states: ['completed', 'returned', 'assigned', 'not_assigned', 'not_assigned', 'not_assigned'],
  },
  {
    title: 'Fonksiyonlar',
    states: ['not_assigned', 'not_assigned', 'not_assigned', 'not_assigned', 'not_assigned'],
  },
]

function section(index: number, row: (typeof SECTION_ROWS)[number]): BookMapSection {
  const tests: BookMapTest[] = row.states.map((state, i) => ({
    id: `demo-s${index}-t${i + 1}`,
    title: `Test ${i + 1}`,
    orderIndex: i,
    state,
    homeworkItemId: null,
    pageStart: null,
    pageEnd: null,
  }))
  return {
    id: `demo-s${index}`,
    title: row.title,
    orderIndex: index,
    tests,
    completedCount: tests.filter(t => t.state === 'completed').length,
    partId: null,
    partTitle: null,
    groupLabel: null,
    themeLabel: null,
    topicId: null,
    curriculumStatus: null,
    pageStart: null,
    pageEnd: null,
    note: null,
    videoUrl: null,
    parentSectionId: null,
    parentTitle: null,
    testStart: 1,
    testEnd: tests.length,
  }
}

export function demoBook(now: Date = new Date()): BookMapBook {
  const sections = SECTION_ROWS.map((row, i) => section(i, row))
  const all = sections.flatMap(s => s.tests)
  return {
    assignmentId: 'demo-assignment',
    bookId: 'demo-book',
    title: 'TYT Matematik Soru Bankası',
    subject: 'Matematik',
    examType: 'TYT',
    levelExam: 'TYT',
    curriculumProgram: null,
    publisher: 'Örnek Yayınları',
    trackingMode: 'test',
    startDate: demoDate(-45, now),
    targetEndDate: demoDate(120, now),
    sections,
    totalTests: all.length,
    completedTests: all.filter(t => t.state === 'completed').length,
    maxTestsPerSection: Math.max(...sections.map(s => s.tests.length)),
    videoMode: 'none',
    videoUrl: null,
    videoDisplay: 'resource',
    status: 'active',
    role: 'ana_calisma',
    scopeId: null,
    target: null,
    interimTarget: null,
  }
}

/** Sepete alınmış örnek işler (turdaki "Haftalık Çalışma Planı" kartı). */
export const DEMO_BASKET = [
  { book: 'TYT Matematik Soru Bankası', unit: 'Problemler · Test 5-7' },
  { book: 'Paragraf Soru Bankası', unit: 'sf. 2-10' },
]

// --- Ders & Görüşmeler + Google Takvim --------------------------------------

export interface DemoLesson {
  day: string
  time: string
  student: string
  kind: string
  /** Satır durumu — gerçek ekrandaki metinlerle aynı. */
  state: 'done' | 'awaiting' | 'calendar_cancelled' | 'planned' | 'makeup'
  fromCalendar: boolean
  meet: boolean
}

export const DEMO_LESSONS: DemoLesson[] = [
  { day: 'Pzt', time: '17:00', student: 'Ayşe Y.', kind: 'Online ders', state: 'done', fromCalendar: true, meet: false },
  { day: 'Sal', time: '18:00', student: 'Mehmet K.', kind: 'Koçluk', state: 'awaiting', fromCalendar: true, meet: false },
  { day: 'Çar', time: '20:00', student: 'Zeynep A.', kind: 'Online ders', state: 'calendar_cancelled', fromCalendar: true, meet: false },
  { day: 'Per', time: '19:00', student: 'Elif Ş.', kind: 'Telafi dersi', state: 'makeup', fromCalendar: false, meet: false },
  { day: 'Cmt', time: '10:00', student: 'Ali R.', kind: 'Online ders', state: 'planned', fromCalendar: true, meet: true },
]

// --- Finans: öğrenci cari hesabı -------------------------------------------

export interface DemoLedgerRow {
  date: string
  label: string
  /** Pozitif = borç (ders), negatif = tahsilat. */
  amount: number
}

export function demoLedger(now: Date = new Date()): DemoLedgerRow[] {
  return [
    { date: demoDate(-21, now), label: 'Online ders · 1 saat', amount: 1200 },
    { date: demoDate(-14, now), label: 'Online ders · 1 saat', amount: 1200 },
    { date: demoDate(-12, now), label: 'Tahsilat · havale', amount: -2400 },
    { date: demoDate(-7, now), label: 'Online ders · 1 saat', amount: 1200 },
    { date: demoDate(-1, now), label: 'Online ders · 1,5 saat', amount: 1800 },
  ]
}

export function ledgerBalance(rows: DemoLedgerRow[]): number {
  return rows.reduce((sum, r) => sum + r.amount, 0)
}

// --- Öğrenci haftası (Haftam) ------------------------------------------------

export const DEMO_WEEK: { title: string; detail: string; state: 'approved' | 'submitted' | 'todo' }[] = [
  { title: 'TYT Matematik', detail: 'Denklemler · Test 4-6', state: 'approved' },
  { title: 'TYT Türkçe', detail: 'Paragraf · 12 sayfa', state: 'submitted' },
  { title: 'TYT Matematik', detail: 'Problemler · Test 5-7', state: 'todo' },
]
