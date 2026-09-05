import { Badge } from '@/components/ui/badge'
import { BookCard } from '@/components/shared/book-card'
import { MetricRow } from '@/components/shared/metric-row'
import { demoDate } from '@/lib/demo-data'
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
    dueDate: demoDate(-2),
    done: 4,
    total: 4,
  },
  {
    id: '2',
    name: 'TYT Türkçe – Paragraf',
    dueDate: demoDate(-1),
    done: 2,
    total: 5,
  },
  {
    id: '3',
    name: 'AYT Fizik – Elektrik',
    dueDate: demoDate(3),
    done: 0,
    total: 3,
  },
]

export function ParentDemo() {
  const completed = mockHomework.filter((hw) => hw.done >= hw.total).length
  // Geciken: tamamlanmamış ve teslim tarihi geçmiş olanlar. demoDate
  // negatif offset'le geçmiş tarih üretiyor; ilk iki kayıt öyle.
  const overdue = mockHomework.filter((hw, i) => hw.done < hw.total && i < 2).length

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{mockChild.name}</h2>
        <Badge variant="neutral">{mockChild.grade}</Badge>
        <StatusBadge status="green" />
      </div>

      <Section title="Bu hafta">
        {/* SAYAÇLAR LİSTEDEN TÜRETİLİYOR. Elle yazılmışlardı ve
            listeyle tutmuyorlardı: "13 verilen ödev" derken aşağıda üç
            satır vardı. Demo da olsa kendi içinde tutarsız bir ekran,
            ürünün sayılarına duyulan güveni zedeler. */}
        <MetricRow
          metrics={[
            { label: 'Verilen ödev', value: mockHomework.length },
            { label: 'Tamamlanan', value: completed },
            { label: 'Bekleyen', value: mockHomework.length - completed },
            { label: 'Geciken', value: overdue },
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
