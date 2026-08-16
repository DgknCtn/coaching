import { Badge } from '@/components/ui/badge'
import { BookCard } from '@/components/shared/book-card'
import { MetricRow } from '@/components/shared/metric-row'
import { Section } from '@/components/shared/section'
import { StatusBadge } from '@/components/shared/status-badge'
import { HomeworkBatchRow } from '@/components/shared/homework-batch-row'

const mockChild = {
  name: 'Ayşe Yılmaz',
  grade: '12. Sınıf · YKS',
  avatar: 'A',
}

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
      title: 'TYT Türkçe Soru Kitabı',
      subject: 'Türkçe',
      publisher: 'Yanıt Yayınları',
      exam_type: 'TYT',
    },
    progress: { completed: 60, total: 80, percentage: 75 },
  },
  {
    book: {
      id: 'b3',
      title: 'AYT Fizik 72 Deneme',
      subject: 'Fizik',
      publisher: 'Hız Yayınları',
      exam_type: 'AYT',
    },
    progress: { completed: 12, total: 72, percentage: 17 },
  },
]

const mockHomework = [
  {
    id: '1',
    name: 'TYT Matematik – Türevler',
    dueDate: '26 Haziran 2026',
    done: 4,
    total: 4,
  },
  {
    id: '2',
    name: 'TYT Türkçe – Paragraf',
    dueDate: '26 Haziran 2026',
    done: 2,
    total: 5,
  },
  {
    id: '3',
    name: 'AYT Fizik – Elektrik',
    dueDate: '28 Haziran 2026',
    done: 0,
    total: 3,
  },
]

export function ParentDemo() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{mockChild.name}</h2>
        <Badge variant="neutral">{mockChild.grade}</Badge>
        <StatusBadge status="green" />
      </div>

      <Section title="Bu hafta">
        <MetricRow
          metrics={[
            { label: 'Verilen ödev', value: 13 },
            { label: 'Tamamlanan', value: 9 },
            { label: 'Bekleyen', value: 2 },
            { label: 'Geciken', value: 2 },
          ]}
        />
      </Section>

      <Section title="Son ödevler" variant="card">
        <ul className="divide-y">
          {mockHomework.map((hw) => (
            <li key={hw.id}>
              <HomeworkBatchRow
                title={hw.name}
                dueDate={hw.dueDate}
                completed={hw.done}
                total={hw.total}
                isOverdue={hw.done === 0}
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Kitap ilerlemesi">
        <div className="grid gap-4 sm:grid-cols-3">
          {mockBooks.map((b) => (
            <BookCard key={b.book.id} book={b.book} progress={b.progress} />
          ))}
        </div>
      </Section>
    </div>
  )
}
