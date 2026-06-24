import { CheckCircle2, Clock, AlertCircle, TrendingUp, BookOpen, Target, XCircle } from 'lucide-react'
import { StatCard } from '@/components/shared/stat-card'
import { BookCard } from '@/components/shared/book-card'

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
    <div className="space-y-6">
      {/* Child header */}
      <div
        className="rounded-2xl p-5 flex items-center gap-4"
        style={{
          background: 'linear-gradient(135deg, oklch(0.065 0.028 255), oklch(0.10 0.04 260))',
        }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black text-white shrink-0"
          style={{
            background: 'linear-gradient(135deg, oklch(0.54 0.22 20), oklch(0.47 0.20 8))',
          }}
        >
          {mockChild.avatar}
        </div>
        <div>
          <div className="text-white font-black text-lg">{mockChild.name}</div>
          <div className="text-sm" style={{ color: 'oklch(0.65 0.02 260)' }}>
            {mockChild.grade}
          </div>
        </div>
        <div className="ml-auto">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{
              background: 'oklch(0.50 0.18 155 / 0.2)',
              color: 'oklch(0.75 0.15 155)',
              border: '1px solid oklch(0.50 0.18 155 / 0.35)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            İyi Durumda
          </div>
        </div>
      </div>

      {/* Weekly stats */}
      <div>
        <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider mb-3">
          Bu Hafta
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={Target} label="Verilen Ödev" value={13} colorScheme="blue" />
          <StatCard icon={CheckCircle2} label="Tamamlanan" value={9} colorScheme="emerald" />
          <StatCard icon={Clock} label="Bekleyen" value={2} colorScheme="amber" />
          <StatCard icon={XCircle} label="Geciken" value={2} colorScheme="red" />
        </div>
      </div>

      {/* Recent homework */}
      <div>
        <h3 className="font-bold text-base mb-3">Son Ödevler</h3>
        <div className="space-y-3">
          {mockHomework.map((hw) => {
            const pct = Math.round((hw.done / hw.total) * 100)
            const done = hw.done === hw.total
            return (
              <div
                key={hw.id}
                className={`bg-card rounded-2xl border p-4 ${done ? 'border-emerald-200' : hw.done === 0 ? 'border-red-200' : 'border-border'}`}
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="font-semibold text-sm">{hw.name}</span>
                  {done ? (
                    <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
                  ) : hw.done === 0 ? (
                    <AlertCircle className="size-5 text-red-500 shrink-0" />
                  ) : (
                    <TrendingUp className="size-5 shrink-0" style={{ color: 'oklch(0.57 0.26 282)' }} />
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full overflow-hidden bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: done
                          ? 'linear-gradient(90deg, oklch(0.55 0.18 155), oklch(0.65 0.15 168))'
                          : hw.done === 0
                            ? 'oklch(0.65 0.20 20)'
                            : 'linear-gradient(90deg, oklch(0.57 0.26 282), oklch(0.65 0.22 300))',
                      }}
                    />
                  </div>
                  <span className="text-xs font-bold tabular-nums w-14 text-right text-muted-foreground">
                    {hw.done}/{hw.total} test
                  </span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">Son teslim: {hw.dueDate}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Book progress */}
      <div>
        <h3 className="font-bold text-base mb-3">
          <BookOpen className="inline size-4 mr-1.5 text-muted-foreground" />
          Kitap İlerlemesi
        </h3>
        <div className="grid sm:grid-cols-3 gap-4">
          {mockBooks.map((b) => (
            <BookCard key={b.book.id} book={b.book} progress={b.progress} />
          ))}
        </div>
      </div>
    </div>
  )
}
