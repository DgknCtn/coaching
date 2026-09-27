import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Plus, Users } from 'lucide-react'
import { LAST_STUDENT_COOKIE, resolveLastStudentId } from '@/lib/last-student'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { QuotaNotice } from '@/components/shared/quota-notice'
import { Section } from '@/components/shared/section'
import { DataTable, type Column } from '@/components/shared/data-table'
import { StudentStatusBadge } from '@/components/shared/student-status-badge'
import { SectionUnavailable } from '@/components/shared/section-unavailable'
import { ProgressBar } from '@/components/shared/progress-bar'
import { studentScreenBySlug } from '@/components/nav-config'
import { listResult } from '@/lib/data-result'
import { counterLabel } from '@/lib/homework-status'
import { statusFromOperationRow, type OperationStatusRow } from '@/lib/operation-status'
import type { StudentStatus } from '@/lib/student-status'

export const dynamic = 'force-dynamic'

/** 080 · teacher_student_operation_view — panelle AYNI satır. */
type OperationRow = OperationStatusRow & {
  student_id: string
  student_full_name: string | null
  exam_type: string | null
  grade_level: string | null
  weekly_total: number | null
  weekly_submitted: number | null
}

type StudentRow = {
  student_id: string
  student_full_name: string | null
  exam_type: string | null
  grade_level: string | null
  weeklyTotal: number
  weeklySubmitted: number
  overdue: number
  /** Kitap ilerlemesi; okunamadıysa null ("—", 0 DEĞİL). */
  completion: number | null
  status: StudentStatus
  signals: string[]
}

export default async function StudentsPage({
  searchParams,
}: {
  // Sol menüdeki "Öğrenci Ekranları" grubu buraya ?ekran=... ile gelir:
  // öğrenci seçilmeden o ekranlara girilemez, bu yüzden liste bir seçim
  // adımı olarak kullanılır ve satırlar doğrudan istenen ekrana bağlanır.
  searchParams: Promise<{ ekran?: string }>
}) {
  const { supabase, workspaceId, usage } = await getTeacherContext()
  // Tanınmayan slug sessizce yok sayılır — elle yazılmış bir adres
  // yüzünden liste bozulmasın.
  const screen = studentScreenBySlug((await searchParams).ekran)

  // ============================================================
  // DURUM PANELLE AYNI KAYNAKTAN (lib/operation-status.ts)
  //
  // Önceden liste `teacher_student_overview_view.risk_status`'u (eski SQL
  // kuralı, red/yellow/green) okuyup "İyi / Dikkat / Kritik" yazıyordu;
  // panel aynı öğrenci için "Takip Et" diyebiliyordu. Durum, "bu hafta"
  // ve gecikme artık panelin satırından; kitap ilerlemesi (yalnız
  // overview'da var) ayrı okunup öğrenci kimliğiyle eşleniyor.
  // ============================================================
  const [operationRes, progressRes] = await Promise.all([
    supabase
      .from('teacher_student_operation_view')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('student_full_name')
      .limit(500),
    supabase
      .from('teacher_student_overview_view')
      .select('student_id, completion_percentage')
      .eq('workspace_id', workspaceId)
      .limit(500),
  ])

  // B01: liste düşerse "Henüz öğrenci yok" DENMEZ.
  const operation = listResult(operationRes, 'students.operation_view')
  const progress = listResult(progressRes, 'students.progress')
  const completionById = new Map<string, number>(
    progress.ok
      ? progress.data.map((p) => [p.student_id as string, Number(p.completion_percentage ?? 0)])
      : []
  )

  const now = new Date()
  const rows: StudentRow[] = (operation.ok ? (operation.data as OperationRow[]) : []).map((s) => {
    const computed = statusFromOperationRow(s, now)
    return {
      student_id: s.student_id,
      student_full_name: s.student_full_name,
      exam_type: s.exam_type,
      grade_level: s.grade_level,
      weeklyTotal: Number(s.weekly_total ?? 0),
      weeklySubmitted: Number(s.weekly_submitted ?? 0),
      overdue: Number(s.overdue_work_count ?? 0),
      completion: progress.ok ? (completionById.get(s.student_id) ?? 0) : null,
      status: computed.status,
      signals: computed.signals,
    }
  })

  // SON ÇALIŞILAN ÖĞRENCİYE DOĞRUDAN GİT (067).
  //
  // Menüden "Kaynak Planı" gibi bir ekran seçildiğinde (?ekran=...) bu
  // liste bir SEÇİM ADIMI olarak araya giriyor. Öğretmen genellikle aynı
  // öğrenci üzerinde çalıştığı için bu adım her ekran değişiminde
  // tekrarlanan bir vergiye dönüşmüştü.
  //
  // Çerezdeki kimlik listeye karşı doğrulanır (resolveLastStudentId):
  // arşivlenmiş, başka çalışma alanına ait ya da kurcalanmış bir değer
  // yönlendirme yapmaz, liste gösterilir.
  //
  // ?ekran= YOKKEN YÖNLENDİRME YOK: "Öğrenciler" bağlantısı listeyi
  // görmek için var; onu da atlamak, öğretmeni kendi listesine
  // ulaşamaz hâle getirirdi.
  if (screen) {
    const lastStudentId = resolveLastStudentId(
      (await cookies()).get(LAST_STUDENT_COOKIE)?.value,
      rows.map((r) => r.student_id)
    )
    if (lastStudentId) {
      redirect(`/teacher/students/${lastStudentId}/${screen.path}`)
    }
  }

  const columns: Column<StudentRow>[] = [
    {
      key: 'student',
      header: 'Öğrenci',
      render: (s) => (
        <div>
          <p className="font-medium">{s.student_full_name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[s.exam_type, s.grade_level].filter(Boolean).join(' · ')}
          </p>
        </div>
      ),
    },
    {
      key: 'week',
      // Panelle aynı sayı ve aynı anlam: öğrencinin GÖNDERDİĞİ iş (B04).
      header: `Bu hafta ${counterLabel('delivered').toLocaleLowerCase('tr')}`,
      align: 'center',
      render: (s) =>
        s.weeklyTotal === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular-nums">
            {s.weeklySubmitted}
            <span className="text-muted-foreground">/{s.weeklyTotal}</span>
          </span>
        ),
    },
    {
      key: 'overdue',
      header: counterLabel('overdue'),
      align: 'center',
      render: (s) =>
        s.overdue > 0 ? (
          <span className="tabular-nums text-destructive">{s.overdue}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'progress',
      header: 'İlerleme',
      hideBelow: 'md',
      className: 'w-40',
      render: (s) =>
        s.completion === null ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="flex items-center gap-3">
            <ProgressBar
              value={s.completion}
              label={`${s.student_full_name} ilerlemesi`}
              className="w-20"
            />
            <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
              {s.completion}%
            </span>
          </div>
        ),
    },
    {
      key: 'status',
      header: 'Durum',
      align: 'center',
      render: (s) => (
        <div className="flex flex-col items-center gap-0.5">
          <StudentStatusBadge status={s.status} />
          {s.signals[0] && (
            <span
              className="max-w-40 text-center text-[11px] text-muted-foreground"
              title={s.signals.join(' · ')}
            >
              {s.signals[0]}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (s) => (
        <Button
          variant="ghost"
          size="sm"
          render={
            <Link
              href={
                screen
                  ? `/teacher/students/${s.student_id}/${screen.path}`
                  : `/teacher/students/${s.student_id}`
              }
            />
          }
        >
          {screen ? screen.label : 'Detay'}
        </Button>
      ),
    },
  ]

  return (
    <div className="max-w-6xl space-y-8 p-6 md:p-8">
      <PageHeader
        title={screen ? screen.label : 'Öğrenciler'}
        subtitle={
          screen
            ? 'Hangi öğrenci için açılacağını seç.'
            : rows.length
              ? `${rows.length} öğrenci`
              : undefined
        }
        action={
          <Button size="sm" render={<Link href="/teacher/students/new" />}>
            <Plus />
            Yeni Öğrenci
          </Button>
        }
      />

      {/* Kota göstergesi burada: yeni öğrenci düğmesinin hemen altında,
          yani sınıra dayanmış bir öğretmen düğmeye basmadan ÖNCE görüyor. */}
      {usage && <QuotaNotice usage={usage} />}

      <Section variant="card">
        {operation.ok ? (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(s) => s.student_id}
            empty={{
              icon: Users,
              title: 'Henüz öğrenci yok',
              description: 'İlk öğrencini ekleyerek takip etmeye başla.',
              action: { label: 'İlk öğrenciyi ekle', href: '/teacher/students/new' },
            }}
          />
        ) : (
          <div className="p-4">
            <SectionUnavailable
              title="Öğrenci listesi şu an alınamadı"
              description="Bu, öğrenci olmadığı anlamına gelmez."
              retryHref="/teacher/students"
            />
          </div>
        )}
      </Section>
    </div>
  )
}
