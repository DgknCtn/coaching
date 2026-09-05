import { BookCard } from '@/components/shared/book-card'
import { demoDate } from '@/lib/demo-data'
import { Section } from '@/components/shared/section'
import { AlertBanner } from '@/components/shared/alert-banner'
import { HomeworkBatchRow } from '@/components/shared/homework-batch-row'

const mockOverdueHomework = [
  {
    id: '1',
    batchName: 'TYT Matematik – Denklemler',
    dueDate: demoDate(-6),
    testsTotal: 5,
    testsDone: 2,
    bookTitle: 'TYT Soru Bankası',
  },
  {
    id: '2',
    batchName: 'AYT Fizik – Kuvvet',
    dueDate: demoDate(-4),
    testsTotal: 3,
    testsDone: 0,
    bookTitle: 'AYT Fizik 72 Deneme',
  },
]

const mockUpcomingHomework = [
  {
    id: '3',
    batchName: 'TYT Türkçe – Anlam Bilgisi',
    dueDate: demoDate(3),
    testsTotal: 4,
    testsDone: 1,
    bookTitle: 'TYT Türkçe Soru Kitabı',
  },
  {
    id: '4',
    batchName: 'AYT Matematik – Türev',
    dueDate: demoDate(5),
    testsTotal: 6,
    testsDone: 6,
    bookTitle: 'AYT Mat 72 Soru',
  },
]

const mockBooks = [
  {
    book: {
      id: 'b1',
      title: 'TYT Soru Bankası',
      subject: 'Matematik',
      publisher: 'Palme Yayınları',
      exam_type: 'TYT',
    },
    progress: { completed: 48, total: 72, percentage: 67 },
  },
  {
    book: {
      id: 'b2',
      title: 'AYT Fizik 72 Deneme',
      subject: 'Fizik',
      publisher: 'Hız Yayınları',
      exam_type: 'AYT',
    },
    progress: { completed: 12, total: 72, percentage: 17 },
  },
  {
    book: {
      id: 'b3',
      title: 'TYT Türkçe Soru Kitabı',
      subject: 'Türkçe',
      publisher: 'Yanıt Yayınları',
      exam_type: 'TYT',
    },
    progress: { completed: 60, total: 80, percentage: 75 },
  },
]

export function StudentDemo() {
  return (
    <div className="space-y-8">
      <AlertBanner
        tone="warning"
        title={`${mockOverdueHomework.length} gecikmiş ödev`}
        description="Bunları en kısa sürede tamamlamayı unutma."
      />

      <Section title="Geciken ödevler" variant="card">
        <ul className="divide-y">
          {mockOverdueHomework.map((hw) => (
            <li key={hw.id}>
              <HomeworkBatchRow
                title={hw.batchName}
                dueDate={hw.dueDate}
                completed={hw.testsDone}
                total={hw.testsTotal}
                isOverdue
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Bu hafta ve yaklaşan" variant="card">
        <ul className="divide-y">
          {mockUpcomingHomework.map((hw) => (
            <li key={hw.id}>
              <HomeworkBatchRow
                title={hw.batchName}
                dueDate={hw.dueDate}
                completed={hw.testsDone}
                total={hw.testsTotal}
                isOverdue={false}
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Kitap ilerlemem">
        <div className="grid gap-4 sm:grid-cols-3">
          {mockBooks.map((b) => (
            <BookCard key={b.book.id} book={b.book} progress={b.progress} />
          ))}
        </div>
      </Section>
    </div>
  )
}
