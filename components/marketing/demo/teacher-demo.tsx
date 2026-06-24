import { Users, TrendingUp, AlertTriangle, BookOpen, Plus } from 'lucide-react'
import { StatCard } from '@/components/shared/stat-card'
import { StatusBadge } from '@/components/shared/status-badge'

const mockStudents = [
  {
    id: '1',
    name: 'Ayşe Yılmaz',
    exam: 'YKS',
    grade: '12. Sınıf',
    status: 'green' as const,
    completion: 92,
    overdue: 0,
    books: 3,
  },
  {
    id: '2',
    name: 'Mehmet Kaya',
    exam: 'YKS',
    grade: '12. Sınıf',
    status: 'yellow' as const,
    completion: 67,
    overdue: 2,
    books: 4,
  },
  {
    id: '3',
    name: 'Zeynep Arslan',
    exam: 'YKS',
    grade: '11. Sınıf',
    status: 'red' as const,
    completion: 34,
    overdue: 5,
    books: 2,
  },
  {
    id: '4',
    name: 'Ali Rıza Demir',
    exam: 'LGS',
    grade: '8. Sınıf',
    status: 'green' as const,
    completion: 78,
    overdue: 1,
    books: 3,
  },
  {
    id: '5',
    name: 'Elif Şahin',
    exam: 'YKS',
    grade: '12. Sınıf',
    status: 'yellow' as const,
    completion: 55,
    overdue: 3,
    books: 5,
  },
]

export function TeacherDemo() {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Toplam Öğrenci" value={24} colorScheme="blue" />
        <StatCard
          icon={TrendingUp}
          label="Haftalık Tamamlama"
          value="74%"
          colorScheme="emerald"
        />
        <StatCard icon={AlertTriangle} label="Geciken Ödev" value={11} colorScheme="red" />
        <StatCard icon={BookOpen} label="Risk Altında" value={3} colorScheme="amber" badge="!" />
      </div>

      {/* Students table */}
      <div className="bg-card rounded-2xl border overflow-hidden shadow-xs">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h3 className="font-bold text-base">Öğrenciler</h3>
            <p className="text-sm text-muted-foreground">2025–2026 YKS Dönemi</p>
          </div>
          <button
            disabled
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-not-allowed opacity-80"
            style={{
              background:
                'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))',
            }}
          >
            <Plus className="size-4" />
            Öğrenci Ekle
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-6 py-3">
                  Öğrenci
                </th>
                <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3 hidden sm:table-cell">
                  Sınav
                </th>
                <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3">
                  Durum
                </th>
                <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3 hidden md:table-cell">
                  İlerleme
                </th>
                <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3 hidden lg:table-cell">
                  Geciken
                </th>
              </tr>
            </thead>
            <tbody>
              {mockStudents.map((s) => (
                <tr
                  key={s.id}
                  className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black text-white shrink-0"
                        style={{
                          background:
                            'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))',
                        }}
                      >
                        {s.name[0]}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.grade}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 hidden sm:table-cell">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-secondary text-secondary-foreground">
                      {s.exam}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-4 hidden md:table-cell">
                    <div className="flex items-center gap-3 min-w-[120px]">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${s.completion}%`,
                            background:
                              s.status === 'green'
                                ? 'linear-gradient(90deg, oklch(0.55 0.18 155), oklch(0.65 0.15 168))'
                                : s.status === 'yellow'
                                  ? 'linear-gradient(90deg, oklch(0.70 0.18 65), oklch(0.78 0.16 55))'
                                  : 'linear-gradient(90deg, oklch(0.55 0.22 20), oklch(0.63 0.20 15))',
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold tabular-nums w-10 text-right">
                        {s.completion}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 hidden lg:table-cell">
                    {s.overdue > 0 ? (
                      <span className="text-sm font-bold text-red-600">{s.overdue}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
