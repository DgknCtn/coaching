import { notFound } from 'next/navigation'
import { getTeacherContext } from '@/lib/workspace'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import type { PoolRowInput } from '@/lib/protection-pool'
import { ProtectionPoolClient, type ScopeTab } from './pool-client'

// Koruma Havuzu (R5.4).
//
// SCOPE KAYNAĞI (§6.1): havuz kendi sabit ders listesini TUTMAZ.
// Öğrencinin dersleri müfredat akışından gelir — akış atanmış her scope
// bir sekmedir. Ayrı bir program/scope eşleme katmanı kurulmadı.
//
// İZLENEN KONULAR: yalnız öğrencinin AKTİF müfredat akışındaki konular.
// Akıştan çıkarılan konu havuzda görünmez ama temas kaydı veritabanında
// durur (KH-17) — geçmiş silinmez, yalnız radar kapsamı daralır.

export const dynamic = 'force-dynamic'

/** Supabase iç içe select'i tek kaydı da dizi tipinde çözebiliyor. */
type Nested<T> = T | T[] | null
function one<T>(value: Nested<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

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

  // Öğrencinin akışındaki konular — havuzun izleme kapsamı budur.
  const { data: flowRows } = await supabase
    .from('student_curriculum_items')
    .select('topic_id, scope_id, topics(name), academic_scopes(name)')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)

  type FlowRow = {
    topic_id: string
    scope_id: string
    topics: Nested<{ name: string }>
    academic_scopes: Nested<{ name: string }>
  }

  const flow = (flowRows ?? []) as unknown as FlowRow[]

  // Ders sekmeleri: akışı olan scope'lar.
  const scopeMap = new Map<string, string>()
  for (const row of flow) {
    if (!scopeMap.has(row.scope_id)) {
      scopeMap.set(row.scope_id, one(row.academic_scopes)?.name ?? 'Kapsam')
    }
  }
  const scopes: ScopeTab[] = [...scopeMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  const activeScopeId =
    rawScope && scopes.some(s => s.id === rawScope) ? rawScope : (scopes[0]?.id ?? null)

  let rows: PoolRowInput[] = []

  if (activeScopeId) {
    const topicsInScope = flow.filter(f => f.scope_id === activeScopeId)
    const topicIds = [...new Set(topicsInScope.map(f => f.topic_id))]

    if (topicIds.length > 0) {
      const [{ data: contactRows }, { data: openRows }, { data: overrideRows }, { data: bookRows }] =
        await Promise.all([
          // Son temas: onaylı çalışmadan TÜRETİLEN + elle girilen ders /
          // serbest çalışma birleşimi (041 view'ı).
          supabase
            .from('student_topic_contact_view')
            .select('topic_id, last_contact_date, last_contact_source, last_contact_amount')
            .eq('student_id', studentId)
            .eq('workspace_id', workspaceId)
            .in('topic_id', topicIds),
          // Açık çalışma: konu "Aktif Çalışma" ise havuzda görünmez.
          supabase
            .from('student_topic_open_work_view')
            .select('topic_id, open_items')
            .eq('student_id', studentId)
            .eq('workspace_id', workspaceId)
            .in('topic_id', topicIds),
          supabase
            .from('student_topic_overrides')
            .select('topic_id, keep_active')
            .eq('student_id', studentId)
            .eq('workspace_id', workspaceId)
            .in('topic_id', topicIds),
          // "Kaynaklara Git" için: bu konuya bağlı bölümlerin kitapları.
          supabase
            .from('book_sections')
            .select('topic_id, books(title)')
            .eq('workspace_id', workspaceId)
            .in('topic_id', topicIds),
        ])

      const contactByTopic = new Map(
        (
          (contactRows ?? []) as {
            topic_id: string
            last_contact_date: string
            last_contact_source: string
            last_contact_amount: number
          }[]
        ).map(r => [r.topic_id, r])
      )

      const openByTopic = new Map(
        ((openRows ?? []) as { topic_id: string; open_items: number }[]).map(r => [
          r.topic_id,
          r.open_items,
        ])
      )

      const overrideByTopic = new Map(
        ((overrideRows ?? []) as { topic_id: string; keep_active: boolean }[]).map(r => [
          r.topic_id,
          r.keep_active,
        ])
      )

      const booksByTopic = new Map<string, string[]>()
      for (const row of (bookRows ?? []) as unknown as {
        topic_id: string
        books: Nested<{ title: string }>
      }[]) {
        const title = one(row.books)?.title
        if (!title) continue
        const list = booksByTopic.get(row.topic_id) ?? []
        if (!list.includes(title)) list.push(title)
        booksByTopic.set(row.topic_id, list)
      }

      const scopeName = scopeMap.get(activeScopeId) ?? 'Kapsam'
      const nameByTopic = new Map(
        topicsInScope.map(f => [f.topic_id, one(f.topics)?.name ?? 'Konu'])
      )

      rows = topicIds.map(topicId => {
        const contact = contactByTopic.get(topicId)
        return {
          topicId,
          topicName: nameByTopic.get(topicId) ?? 'Konu',
          scopeId: activeScopeId,
          scopeName,
          lastContactDate: contact?.last_contact_date ?? null,
          lastContactSource:
            (contact?.last_contact_source as PoolRowInput['lastContactSource']) ?? null,
          lastContactAmount: Number(contact?.last_contact_amount ?? 0),
          openWorkCount: Number(openByTopic.get(topicId) ?? 0),
          keepActive: overrideByTopic.get(topicId) === true,
          bookTitles: booksByTopic.get(topicId) ?? [],
        }
      })
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
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
