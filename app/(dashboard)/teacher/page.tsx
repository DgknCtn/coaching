import Link from 'next/link'
import {
  Users, TrendingUp, AlertTriangle, Clock, Plus, ArrowUpRight, Sparkles,
} from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { StatCard } from '@/components/shared/stat-card'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/empty-state'

export const dynamic = 'force-dynamic'

export default async function TeacherDashboard() {
  const { supabase, workspaceId, activeTerm, profile } = await getTeacherContext()

  const { data: students } = await supabase
    .from('teacher_student_overview_view')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('risk_status', { ascending: true })
    .order('student_full_name')

  const totalStudents = students?.length ?? 0
  const weekAssigned = students?.reduce((sum, s) => sum + Number(s.current_week_assigned_tests ?? 0), 0) ?? 0
  const weekCompleted = students?.reduce((sum, s) => sum + Number(s.current_week_completed_tests ?? 0), 0) ?? 0
  const totalOverdue = students?.reduce((sum, s) => sum + Number(s.overdue_tests ?? 0), 0) ?? 0
  const riskCount = students?.filter((s) => s.risk_status === 'red' || s.risk_status === 'yellow').length ?? 0
  const weekRate = weekAssigned > 0 ? Math.round((weekCompleted / weekAssigned) * 100) : 0

  const needsSetup = !activeTerm

  const firstName = profile.full_name.split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar'

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">
              {greeting}
            </p>
            <h1 className="text-3xl font-black tracking-tight">
              {firstName} <span className="text-muted-foreground/40">👋</span>
            </h1>
            {activeTerm ? (
              <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                <span className="font-medium">{activeTerm.name}</span>
                <span className="text-muted-foreground/50">dönemi aktif</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">Henüz aktif dönem yok</p>
            )}
          </div>
          <Link href="/teacher/students/new">
            <Button
              size="sm"
              className="gap-2 rounded-xl h-9 font-semibold shadow-sm"
              style={{ background: 'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))' }}
            >
              <Plus className="size-3.5" /> Öğrenci Ekle
            </Button>
          </Link>
        </div>
      </div>

      {/* Setup prompt */}
      {needsSetup && (
        <div
          className="mb-8 p-6 rounded-2xl border-2 border-dashed relative overflow-hidden"
          style={{ borderColor: 'oklch(0.57 0.26 282 / 0.25)', background: 'oklch(0.57 0.26 282 / 0.03)' }}
        >
          <div className="absolute top-4 right-4">
            <Sparkles className="size-5 text-primary/20" />
          </div>
          <p className="font-bold text-sm mb-5" style={{ color: 'oklch(0.57 0.26 282)' }}>
            Başlangıç adımları
          </p>
          <div className="space-y-3 text-sm">
            <Link
              href="/teacher/terms"
              className="flex items-center gap-3.5 text-foreground hover:text-primary transition-colors group"
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 text-white"
                style={{ background: 'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))' }}
              >
                1
              </span>
              <span className="font-semibold">Eğitim dönemi oluştur ve aktif et</span>
              <ArrowUpRight className="size-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
            </Link>
            {[
              'Kitap havuzuna kitap ekle',
              'Öğrenci ekle ve kitap ata',
            ].map((step, i) => (
              <div key={step} className="flex items-center gap-3.5 text-muted-foreground/50">
                <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-black shrink-0">
                  {i + 2}
                </span>
                {step}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Users}
          label="Öğrenci"
          value={totalStudents}
          colorScheme="blue"
        />
        <StatCard
          icon={TrendingUp}
          label="Bu Hafta"
          value={weekCompleted}
          subValue={`/${weekAssigned}`}
          badge={weekAssigned > 0 ? `%${weekRate}` : undefined}
          colorScheme="emerald"
        />
        <StatCard
          icon={AlertTriangle}
          label="Geciken"
          value={totalOverdue}
          colorScheme={totalOverdue > 0 ? 'red' : 'neutral'}
        />
        <StatCard
          icon={Clock}
          label="Riskli"
          value={riskCount}
          colorScheme={riskCount > 0 ? 'amber' : 'neutral'}
        />
      </div>

      {/* Students table */}
      <div className="bg-card rounded-2xl border shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20">
          <div>
            <h2 className="font-bold text-sm">Öğrenci Durumu</h2>
            {students?.length ? (
              <p className="text-xs text-muted-foreground mt-0.5">{students.length} öğrenci</p>
            ) : null}
          </div>
          <Link href="/teacher/students">
            <Button size="sm" variant="ghost" className="gap-1.5 h-8 text-xs rounded-lg font-semibold">
              Tümünü Gör <ArrowUpRight className="size-3" />
            </Button>
          </Link>
        </div>

        {!students?.length ? (
          <EmptyState
            icon={Users}
            title="Henüz öğrenci yok"
            description="İlk öğrencini ekleyerek takip etmeye başla."
            action={{ label: 'Öğrenci Ekle', href: '/teacher/students/new' }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-6 py-3 text-[11px] font-bold text-muted-foreground tracking-widest uppercase">
                    Öğrenci
                  </th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold text-muted-foreground tracking-widest uppercase whitespace-nowrap">
                    Bu Hafta
                  </th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold text-muted-foreground tracking-widest uppercase">
                    Geciken
                  </th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold text-muted-foreground tracking-widest uppercase hidden md:table-cell">
                    İlerleme
                  </th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold text-muted-foreground tracking-widest uppercase">
                    Durum
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const isRed = s.risk_status === 'red'
                  const isYellow = s.risk_status === 'yellow'
                  return (
                    <tr
                      key={s.student_id}
                      className={cn(
                        'border-b last:border-0 transition-colors group',
                        isRed
                          ? 'hover:bg-red-50/50'
                          : isYellow
                          ? 'hover:bg-amber-50/40'
                          : 'hover:bg-muted/30'
                      )}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'w-9 h-9 rounded-full flex items-center justify-center shrink-0 ring-1',
                              isRed
                                ? 'ring-red-200 bg-red-50'
                                : isYellow
                                ? 'ring-amber-200 bg-amber-50'
                                : 'bg-primary/8 ring-primary/15'
                            )}
                          >
                            <span className={cn(
                              'text-[11px] font-black',
                              isRed ? 'text-red-600' : isYellow ? 'text-amber-600' : 'text-primary'
                            )}>
                              {(s.student_full_name ?? '?').charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-bold text-sm">{s.student_full_name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{s.exam_type ?? ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={cn(
                          'text-sm font-bold',
                          s.current_week_assigned_tests && Number(s.current_week_completed_tests) === Number(s.current_week_assigned_tests)
                            ? 'text-emerald-600'
                            : 'text-foreground'
                        )}>
                          {s.current_week_completed_tests ?? 0}
                          <span className="text-muted-foreground font-normal">/{s.current_week_assigned_tests ?? 0}</span>
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {Number(s.overdue_tests) > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200">
                            {s.overdue_tests}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <div className="flex items-center gap-3 justify-center">
                          <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, Number(s.completion_percentage))}%`,
                                background: 'linear-gradient(90deg, oklch(0.57 0.26 282), oklch(0.65 0.22 300))',
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-9 text-right font-semibold">
                            {s.completion_percentage}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <StatusBadge status={s.risk_status ?? 'neutral'} />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link href={`/teacher/students/${s.student_id}`}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-8 px-3 rounded-lg font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Detay →
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
