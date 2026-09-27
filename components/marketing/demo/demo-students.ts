import { demoDate } from '@/lib/demo-data'
import type { StudentStatus } from '@/lib/student-status'

// DEMO ÖĞRENCİ VERİSİ — tablo ve detay paneli için TEK KAYNAK.
//
// ============================================================
// NEDEN AYRI DOSYA
//
// Tablo satırı ile detay paneli aynı öğrenciyi anlatıyor. İki ayrı
// dizide tutulsalardı biri güncellenirken diğeri bayatlar ve demo kendi
// içinde çelişirdi — vitrinde en pahalı hata bu.
//
// TARİHLER GÖRELİ: lib/demo-data.ts'teki gerekçe burada da geçerli.
// Elle yazılmış tarihler birkaç ay içinde geçmişte kalıyor.
//
// ÖĞRENCİ ADLARI KISALTILMIŞ ("Ayşe Y."): demo verisi olduğu belli
// olsun ve gerçek bir kişiye ait sanılmasın diye.
// ============================================================

export interface DemoTask {
  name: string
  /** Rozet tonu: geciken görevler kırmızı, yaklaşanlar sarı. */
  tone: 'red' | 'yellow'
  due: string
}

export interface DemoBookProgress {
  title: string
  subject: string
  done: number
  total: number
}

export interface DemoStudent {
  id: string
  name: string
  exam: string
  grade: string
  /** Ürünün durum sözlüğü (lib/student-status.ts) — demoya özel etiket yok. */
  status: StudentStatus
  /** Durumun NEDENİ; üründe panel tablosu bunu rozetin altında gösterir. */
  signals: string[]
  completion: number
  overdue: number
  books: number
  doneTasks: number
  totalTasks: number
  lastActiveDays: number
  /** Detay panelinde görünen geciken görevler. */
  tasks: DemoTask[]
  bookProgress: DemoBookProgress[]
  /** Koç notu — üründeki akademik notlar panelinin karşılığı. */
  note: string
}

export const demoStudents: DemoStudent[] = [
  {
    id: '1',
    name: 'Ayşe Y.',
    exam: 'YKS',
    grade: '12. Sınıf',
    status: 'yolunda',
    signals: [],
    completion: 92,
    overdue: 0,
    books: 3,
    doneTasks: 8,
    totalTasks: 8,
    lastActiveDays: 0,
    tasks: [],
    bookProgress: [
      { title: 'TYT Matematik Soru Bankası', subject: 'Matematik', done: 268, total: 320 },
      { title: 'TYT Türkçe Soru Kitabı', subject: 'Türkçe', done: 60, total: 80 },
    ],
    note: 'Düzenli çalışıyor, tempo korunmalı.',
  },
  {
    id: '2',
    name: 'Mehmet K.',
    exam: 'YKS',
    grade: '12. Sınıf',
    status: 'takip_et',
    signals: ['2 geciken çalışma'],
    completion: 67,
    overdue: 2,
    books: 4,
    doneTasks: 5,
    totalTasks: 8,
    lastActiveDays: 2,
    tasks: [
      { name: 'AYT Matematik — Türev, 20 soru', tone: 'red', due: demoDate(-3) },
      { name: 'TYT Fizik — Test 6', tone: 'yellow', due: demoDate(2) },
    ],
    bookProgress: [
      { title: 'AYT Matematik 72 Deneme', subject: 'Matematik', done: 34, total: 72 },
      { title: 'TYT Fizik Soru Bankası', subject: 'Fizik', done: 96, total: 180 },
    ],
    note: 'Matematikte tempo düştü; haftalık yük azaltılabilir.',
  },
  {
    id: '3',
    name: 'Zeynep A.',
    exam: 'YKS',
    grade: '11. Sınıf',
    status: 'mudahale',
    signals: ['5 geciken çalışma', '4 gündür çalışma teslimi yok'],
    completion: 34,
    overdue: 5,
    books: 2,
    doneTasks: 3,
    totalTasks: 9,
    lastActiveDays: 4,
    tasks: [
      { name: 'TYT Matematik — Test 4', tone: 'red', due: demoDate(-6) },
      { name: 'Fizik — 30 soru', tone: 'red', due: demoDate(-4) },
      { name: 'Paragraf — 20 soru', tone: 'yellow', due: demoDate(1) },
    ],
    bookProgress: [
      { title: 'TYT Matematik Soru Bankası', subject: 'Matematik', done: 184, total: 320 },
      { title: 'TYT Fizik Soru Bankası', subject: 'Fizik', done: 22, total: 180 },
    ],
    note: 'Matematikte son iki haftadır gerileme var.',
  },
  {
    id: '4',
    name: 'Ali Rıza D.',
    exam: 'LGS',
    grade: '8. Sınıf',
    status: 'yolunda',
    signals: [],
    completion: 78,
    overdue: 1,
    books: 3,
    doneTasks: 7,
    totalTasks: 8,
    lastActiveDays: 0,
    tasks: [{ name: 'LGS Matematik — Test 9', tone: 'yellow', due: demoDate(2) }],
    bookProgress: [
      { title: 'LGS Matematik Soru Bankası', subject: 'Matematik', done: 142, total: 200 },
    ],
    note: 'Deneme sonuçları istikrarlı.',
  },
  {
    id: '5',
    name: 'Elif Ş.',
    exam: 'YKS',
    grade: '12. Sınıf',
    status: 'geride',
    signals: ['3 geciken çalışma', 'Haftalık teslim beklenenin gerisinde'],
    completion: 55,
    overdue: 3,
    books: 5,
    doneTasks: 4,
    totalTasks: 8,
    lastActiveDays: 1,
    tasks: [
      { name: 'AYT Kimya — Test 3', tone: 'red', due: demoDate(-2) },
      { name: 'TYT Türkçe — Paragraf 40 soru', tone: 'yellow', due: demoDate(3) },
    ],
    bookProgress: [
      { title: 'AYT Kimya Soru Bankası', subject: 'Kimya', done: 58, total: 160 },
      { title: 'TYT Türkçe Soru Kitabı', subject: 'Türkçe', done: 44, total: 80 },
    ],
    note: 'Kimya haftalık planın gerisinde.',
  },
]

// ============================================================
// SAHNE ÖZETİ — landing'deki önizleme ve demo AYNI sayıları gösterir.
//
// Önceden hero "24 öğrenci · %86", demo "24 öğrenci · %74" diyordu ve
// ikisi de listelenen beş öğrenciyle tutmuyordu. Sayılar artık listeden
// türetiliyor: vitrin kendi içinde çelişmiyor.
// ============================================================
export function demoSummary() {
  const delivered = demoStudents.reduce((n, s) => n + s.doneTasks, 0)
  const total = demoStudents.reduce((n, s) => n + s.totalTasks, 0)
  return {
    students: demoStudents.length,
    delivered,
    total,
    deliveredPercent: total > 0 ? Math.round((delivered / total) * 100) : 0,
    overdue: demoStudents.reduce((n, s) => n + s.overdue, 0),
    needsAttention: demoStudents.filter((s) => s.status !== 'yolunda').length,
  }
}
