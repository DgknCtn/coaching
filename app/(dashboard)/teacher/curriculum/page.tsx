import { getTeacherContext } from '@/lib/workspace'
import { PageHeader } from '@/components/shared/page-header'
import {
  CurriculumTemplatesClient,
  type ScopeRow,
  type TemplateRow,
} from './templates-client'

// Müfredat Şablonları (R5.2 §4.2).
//
// Şablon workspace düzeyindedir ve öğrenciden bağımsız yaşar. Öğrenciye
// atandığında SNAPSHOT alınır: o andan sonra şablonu değiştirmek mevcut
// öğrencilerin tarihlerini DEĞİŞTİRMEZ (MA-03).

export const dynamic = 'force-dynamic'

export default async function CurriculumTemplatesPage() {
  const { supabase, workspaceId } = await getTeacherContext()

  const [{ data: scopeRows }, { data: templateRows }] = await Promise.all([
    supabase
      .from('academic_scopes')
      .select('id, name, subject, level_exam')
      .eq('workspace_id', workspaceId)
      .eq('active', true)
      .order('sort_order')
      .order('name'),
    supabase
      .from('curriculum_templates')
      .select(
        `id, name, scope_id,
         curriculum_template_items(sort_order, duration_weeks, note, topics(name))`
      )
      .eq('workspace_id', workspaceId)
      .eq('active', true)
      .order('name'),
  ])

  const scopes: ScopeRow[] = (
    (scopeRows ?? []) as {
      id: string
      name: string
      subject: string | null
      level_exam: string | null
    }[]
  ).map(s => ({
    id: s.id,
    name: s.name,
    subject: s.subject,
    levelExam: s.level_exam,
  }))

  const templates: TemplateRow[] = (
    (templateRows ?? []) as unknown as {
      id: string
      name: string
      scope_id: string
      curriculum_template_items: {
        sort_order: number
        duration_weeks: number
        note: string | null
        topics: { name: string } | { name: string }[] | null
      }[]
    }[]
  ).map(t => ({
    id: t.id,
    name: t.name,
    scopeId: t.scope_id,
    items: [...(t.curriculum_template_items ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(i => ({
        name: (Array.isArray(i.topics) ? i.topics[0] : i.topics)?.name ?? 'Konu',
        duration_weeks: i.duration_weeks,
        note: i.note,
      })),
  }))

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Müfredat Şablonları"
        subtitle="Ders bazlı konu sırası ve süreleri. Şablonda tarih yoktur; tarihler öğrenciye atarken hesaplanır."
      />

      <CurriculumTemplatesClient scopes={scopes} templates={templates} />
    </div>
  )
}
