import { CalendarDays, Video } from 'lucide-react'
import { StudentStatusBadge } from '@/components/shared/student-status-badge'
import { counterLabel } from '@/lib/homework-status'
import { demoStudents, demoSummary } from '../demo/demo-students'
import { BrowserWindow } from './browser-window'

// KOÇ PANELİ — öğrenci durumu, gerekçesi ve ilerlemesi; bugünkü Calendar
// dersi. Hero ve /ozellikler "Öğrenci Yönetimi" aynı ekranı kullanır.

export function StudentListMock({ rows = 4 }: { rows?: number }) {
  const summary = demoSummary()
  const stats = [
    { label: 'Öğrenci', value: String(summary.students) },
    { label: `Bu hafta ${counterLabel('delivered').toLocaleLowerCase('tr')}`, value: `${summary.deliveredPercent}%` },
    { label: counterLabel('overdue'), value: String(summary.overdue) },
    { label: 'Dikkat isteyen', value: String(summary.needsAttention) },
  ]
  return (
    <BrowserWindow
      title="Koç paneli · bu hafta"
      label="Koç paneli: öğrencilerin bu haftaki teslimleri, ilerlemesi, durumu ve nedeni; bugünkü ders"
    >
      <div className="grid grid-cols-2 gap-px bg-border @md:grid-cols-4">
        {stats.map(s => (
          <div key={s.label} className="bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t bg-info-subtle/40 px-4 py-2 text-xs">
        <CalendarDays className="size-3.5 shrink-0 text-info-foreground" />
        <span className="font-medium">Bugün 17:00</span>
        <span className="truncate text-muted-foreground">Ayşe Y. · Online ders</span>
        <span className="ml-auto hidden items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground @sm:inline-flex">
          <CalendarDays className="size-3" />
          Calendar
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
          <Video className="size-3" />
          Katıl
        </span>
      </div>

      <div className="border-t">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="text-sm font-semibold">Öğrenci durumu</p>
          <p className="text-xs text-muted-foreground">{summary.students} öğrenci</p>
        </div>
        <ul className="divide-y">
          {demoStudents.slice(0, rows).map(r => {
            const pct = Math.round((r.doneTasks / Math.max(r.totalTasks, 1)) * 100)
            return (
              <li
                key={r.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 @md:grid-cols-[minmax(0,1fr)_7rem_auto] @md:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.signals[0] ?? `${r.exam} · ${r.grade}`}</p>
                </div>
                <div className="hidden items-center gap-2 @md:flex">
                  <div className="h-1.5 flex-1 rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                    {r.doneTasks}/{r.totalTasks}
                  </span>
                </div>
                <StudentStatusBadge status={r.status} />
              </li>
            )
          })}
        </ul>
      </div>
    </BrowserWindow>
  )
}
