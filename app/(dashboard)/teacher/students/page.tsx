import Link from 'next/link'
import { Plus, Users, AlertTriangle, CheckCircle2, Clock, Minus } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const riskColors = {
  red: 'text-red-600',
  yellow: 'text-yellow-600',
  green: 'text-green-600',
  neutral: 'text-muted-foreground',
}

const RiskIcon = ({ status }: { status: string }) => {
  if (status === 'red') return <AlertTriangle className="size-4 text-red-500" />
  if (status === 'yellow') return <Clock className="size-4 text-yellow-500" />
  if (status === 'green') return <CheckCircle2 className="size-4 text-green-500" />
  return <Minus className="size-4 text-muted-foreground" />
}

export default async function StudentsPage() {
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: students } = await supabase
    .from('teacher_student_overview_view')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('student_full_name')

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Öğrenciler</h1>
        <Link href="/teacher/students/new">
          <Button size="sm">
            <Plus className="size-4" /> Yeni Öğrenci
          </Button>
        </Link>
      </div>

      {!students?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="size-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">Henüz öğrenci yok.</p>
          <Link href="/teacher/students/new" className="mt-4">
            <Button variant="outline">İlk öğrenciyi ekle</Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Öğrenci</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Bu Hafta</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Geciken</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">İlerleme</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Durum</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.student_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{s.student_full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.exam_type ?? ''}{s.grade_level ? ` · ${s.grade_level}` : ''}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs">
                      {s.current_week_completed_tests}/{s.current_week_assigned_tests}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {Number(s.overdue_tests) > 0 ? (
                      <Badge variant="destructive" className="text-xs">{s.overdue_tests}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${Math.min(100, Number(s.completion_percentage))}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{s.completion_percentage}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <RiskIcon status={s.risk_status ?? 'neutral'} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/teacher/students/${s.student_id}`}>
                      <Button size="xs" variant="outline">Detay</Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
