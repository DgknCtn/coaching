import { notFound } from 'next/navigation'
import { getTeacherContext } from '@/lib/workspace'
import { loadProtectionPoolData } from '@/lib/protection-pool-rows'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { ProtectionPoolClient } from './pool-client'

// Koruma Havuzu (R5.4).
//
// Veri kurulumu lib/protection-pool-rows.ts'te: scope kaynağı (§6.1),
// izlenen konu kapsamı ve satır alanları orada anlatılır. Bu dosya yalnız
// öğretmen bağlamını (yetki, başlık, öğrenci rozeti) ekler.

export const dynamic = 'force-dynamic'

export default async function StudentProtectionPoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>
  searchParams: Promise<{ scope?: string }>
}) {
  const { studentId } = await params
  const { scope: rawScope } = await searchParams
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, exam_type, grade_level, status')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!student || student.status === 'archived') notFound()

  // Havuz verisi ORTAK yükleyiciden gelir (lib/protection-pool-rows.ts);
  // öğrencinin "Tekrar edilecek konular" ekranı da aynı satırları kurar.
  const { scopes, activeScopeId, rows } = await loadProtectionPoolData(supabase, {
    workspaceId,
    studentId,
    requestedScopeId: rawScope,
  })

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
      <PageHeader
        backHref={`/teacher/students/${studentId}`}
        title={`${student.full_name} — Koruma Havuzu`}
        subtitle="Daha önce çalışılmış ancak uzun süredir doğrudan temas edilmeyen konular."
        badges={
          <>
            {student.exam_type && <Badge variant="neutral">{student.exam_type}</Badge>}
            {student.grade_level && <Badge variant="neutral">{student.grade_level}</Badge>}
          </>
        }
      />

      <ProtectionPoolClient
        studentId={studentId}
        scopes={scopes}
        activeScopeId={activeScopeId}
        rows={rows}
      />
    </div>
  )
}
