import Link from 'next/link'
import {
  Users, BookOpen, ClipboardList, AlertTriangle, CheckCircle2, Clock, Minus, Plus, TrendingUp,
} from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const RiskIcon = ({ status }: { status: string }) => {
  if (status === 'red') return <AlertTriangle className="size-4 text-red-500" />
  if (status === 'yellow') return <Clock className="size-4 text-amber-500" />
  if (status === 'green') return <CheckCircle2 className="size-4 text-emerald-500" />
  return <Minus className="size-4 text-muted-foreground" />
}

const RiskBadge = ({ status }: { status: string }) => {
  if (status === 'red') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-600 border border-red-100">Kritik</span>
  if (status === 'yellow') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-600 border border-amber-100">Dikkat</span>
  if (status === 'green') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">İyi</span>
  return <span className="text-muted-foreground text-xs">—</span>
}

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

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          Merhaba, {profile.full_name.split(' ')[0]} 👋
        </h1>
        {activeTerm ? (
          <p className="text-sm text-muted-foreground mt-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              {activeTerm.name} dönemi aktif
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground mt-1">Henüz aktif dönem yok.</p>
        )}
      </div>

      {/* Setup prompt */}
      {needsSetup && (
        <div className="mb-8 p-5 rounded-2xl border-2 border-dashed border-primary/25 bg-primary/4">
          <p className="font-semibold text-sm mb-3 text-primary">Başlangıç adımları</p>
          <div className="space-y-2.5 text-sm">
            <Link
              href="/teacher/terms"
              className="flex items-center gap-3 text-foreground hover:text-primary transition-colors group"
            >
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">1</span>
              Eğitim dönemi oluştur ve aktif et
              <span className="text-primary text-xs opacity-0 group-hover:opacity-100 transition-opacity">→</span>
            </Link>
            <div className="flex items-center gap-3 text-muted-foreground opacity-50">
              <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">2</span>
              Kitap havuzuna kitap ekle
            </div>
            <div className="flex items-center gap-3 text-muted-foreground opacity-50">
              <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">3</span>
              Öğrenci ekle ve kitap ata
            </div>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Students */}
        <div className="bg-card rounded-2xl border p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Users className="size-4 text-blue-600" />
            </div>
          </div>
          <p className="text-3xl font-bold tracking-tight">{totalStudents}</p>
          <p className="text-xs text-muted-foreground mt-1">Öğrenci</p>
        </div>

        {/* Weekly progress */}
        <div className="bg-card rounded-2xl border p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="size-4 text-emerald-600" />
            </div>
            {weekAssigned > 0 && (
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                %{weekRate}
              </span>
            )}
          </div>
          <p className="text-3xl font-bold tracking-tight">
            {weekCompleted}
            <span className="text-lg text-muted-foreground font-normal">/{weekAssigned}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">Bu Hafta</p>
        </div>

        {/* Overdue */}
        <div className={cn('bg-card rounded-2xl border p-5 shadow-xs', totalOverdue > 0 && 'border-red-100')}>
          <div className="flex items-center justify-between mb-4">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', totalOverdue > 0 ? 'bg-red-50' : 'bg-muted')}>
              <AlertTriangle className={cn('size-4', totalOverdue > 0 ? 'text-red-500' : 'text-muted-foreground')} />
            </div>
          </div>
          <p className={cn('text-3xl font-bold tracking-tight', totalOverdue > 0 && 'text-red-600')}>
            {totalOverdue}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Geciken</p>
        </div>

        {/* Risk */}
        <div className={cn('bg-card rounded-2xl border p-5 shadow-xs', riskCount > 0 && 'border-amber-100')}>
          <div className="flex items-center justify-between mb-4">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', riskCount > 0 ? 'bg-amber-50' : 'bg-muted')}>
              <Clock className={cn('size-4', riskCount > 0 ? 'text-amber-500' : 'text-muted-foreground')} />
            </div>
          </div>
          <p className={cn('text-3xl font-bold tracking-tight', riskCount > 0 && 'text-amber-600')}>
            {riskCount}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Riskli</p>
        </div>
      </div>

      {/* Students table */}
      <div className="bg-card rounded-2xl border shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-sm">Öğrenci Durumu</h2>
          <Link href="/teacher/students/new">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
              <Plus className="size-3" /> Öğrenci Ekle
            </Button>
          </Link>
        </div>

        {!students?.length ? (
          <div className="py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted mx-auto mb-4 flex items-center justify-center">
              <Users className="size-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground mb-4">Henüz öğrenci yok.</p>
            <Link href="/teacher/students/new">
              <Button variant="outline" size="sm">İlk öğrenciyi ekle</Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Öğrenci</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Bu Hafta</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Geciken</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">İlerleme</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Durum</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.student_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-[11px] font-bold text-primary">
                            {(s.student_full_name ?? '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-sm">{s.student_full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.exam_type ?? ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={cn(
                        'text-xs font-medium',
                        s.current_week_assigned_tests && Number(s.current_week_completed_tests) === Number(s.current_week_assigned_tests)
                          ? 'text-emerald-600'
                          : 'text-foreground'
                      )}>
                        {s.current_week_completed_tests}/{s.current_week_assigned_tests}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {Number(s.overdue_tests) > 0 ? (
                        <Badge variant="destructive" className="text-[11px] px-2">{s.overdue_tests}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${Math.min(100, Number(s.completion_percentage))}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">
                          {s.completion_percentage}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <RiskBadge status={s.risk_status ?? 'neutral'} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link href={`/teacher/students/${s.student_id}`}>
                        <Button size="xs" variant="ghost" className="text-xs h-7">
                          Detay →
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
