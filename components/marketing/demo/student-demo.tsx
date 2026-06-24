import { Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { BookCard } from '@/components/shared/book-card'

const mockOverdueHomework = [
  {
    id: '1',
    batchName: 'TYT Matematik – Denklemler',
    dueDate: '18 Haziran 2026',
    testsTotal: 5,
    testsDone: 2,
    bookTitle: 'TYT Soru Bankası',
  },
  {
    id: '2',
    batchName: 'AYT Fizik – Kuvvet',
    dueDate: '20 Haziran 2026',
    testsTotal: 3,
    testsDone: 0,
    bookTitle: 'AYT Fizik 72 Deneme',
  },
]

const mockUpcomingHomework = [
  {
    id: '3',
    batchName: 'TYT Türkçe – Anlam Bilgisi',
    dueDate: '26 Haziran 2026',
    testsTotal: 4,
    testsDone: 1,
    bookTitle: 'TYT Türkçe Soru Kitabı',
  },
  {
    id: '4',
    batchName: 'AYT Matematik – Türev',
    dueDate: '28 Haziran 2026',
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
      {/* Overdue */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="size-5 text-red-500" />
          <h3 className="font-bold text-base">Geciken Ödevler</h3>
          <span className="ml-1 text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
            {mockOverdueHomework.length}
          </span>
        </div>
        <div className="space-y-3">
          {mockOverdueHomework.map((hw) => (
            <div key={hw.id} className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm mb-1">{hw.batchName}</div>
                  <div className="flex items-center gap-2 text-xs text-red-600">
                    <Clock className="size-3.5" />
                    Son teslim: {hw.dueDate}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-bold text-red-700">
                    {hw.testsDone}/{hw.testsTotal}
                  </div>
                  <div className="text-xs text-red-500">test tamamlandı</div>
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full overflow-hidden bg-red-200">
                <div
                  className="h-full rounded-full bg-red-500"
                  style={{ width: `${(hw.testsDone / hw.testsTotal) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="size-5" style={{ color: 'oklch(0.57 0.26 282)' }} />
          <h3 className="font-bold text-base">Bu Hafta ve Yaklaşan</h3>
        </div>
        <div className="space-y-3">
          {mockUpcomingHomework.map((hw) => {
            const pct = Math.round((hw.testsDone / hw.testsTotal) * 100)
            const done = hw.testsDone === hw.testsTotal
            return (
              <div
                key={hw.id}
                className={`bg-card border rounded-2xl p-4 ${done ? 'border-emerald-200 bg-emerald-50' : 'border-border'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {done && <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />}
                      <span className={`font-semibold text-sm ${done ? 'text-emerald-700' : ''}`}>
                        {hw.batchName}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">Son teslim: {hw.dueDate}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`text-sm font-bold ${done ? 'text-emerald-700' : ''}`}>
                      {hw.testsDone}/{hw.testsTotal}
                    </div>
                    <div className="text-xs text-muted-foreground">test</div>
                  </div>
                </div>
                {!done && (
                  <div className="mt-3 h-1.5 rounded-full overflow-hidden bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background:
                          'linear-gradient(90deg, oklch(0.57 0.26 282), oklch(0.65 0.22 300))',
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Book progress */}
      <div>
        <h3 className="font-bold text-base mb-4">Kitap İlerlemem</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          {mockBooks.map((b) => (
            <BookCard key={b.book.id} book={b.book} progress={b.progress} />
          ))}
        </div>
      </div>
    </div>
  )
}
