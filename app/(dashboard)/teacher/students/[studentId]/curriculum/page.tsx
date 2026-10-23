import { notFound } from 'next/navigation'
import { getTeacherContext } from '@/lib/workspace'
import { loadOpenWorkTopicIds } from '@/lib/open-work'
import { loadTopicCoverage, type TopicCoverage } from '@/lib/curriculum-book-coverage'
import { PageHeader } from '@/components/shared/page-header'
import type { FlowItem } from '@/lib/curriculum-flow'
import {
  CurriculumFlowEditor,
  type ScopeOption,
  type TemplateOption,
} from './flow-editor'

// Müfredat Akışı (R5.2).
//
// Öğrencinin TEK kişisel akademik akışı. Okul + kurs + MatMüh için üç
// paralel takvim tutulmaz (§4.1); ders/kapsam seçimi yalnız aynı akışın
// farklı dersini göstermek içindir.
//
// ÖĞRENCİNİN SCOPE LİSTESİ nereden geliyor: akışı olan scope'lar +
// workspace'teki tüm scope'lar. Ayrı bir "student_programs" tablosu
// KURULMADI; öğrenciye program atama katmanı olmadan da akış kurulabilsin
// diye. R5.4 (Koruma Havuzu) da aynı türetmeyi kullanacak.

export const dynamic = 'force-dynamic'

/** Supabase iç içe select'i tek kaydı da dizi tipinde çözebiliyor. */
type Nested<T> = T | T[] | null
function one<T>(value: Nested<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export default async function StudentCurriculumPage({
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

  const [{ data: scopeRows }, { data: templateRows }] = await Promise.all([
    supabase
      .from('academic_scopes')
      .select('id, name, sort_order')
      .eq('workspace_id', workspaceId)
      .eq('active', true)
      .order('sort_order')
      .order('name'),
    supabase
      .from('curriculum_templates')
      .select('id, name, scope_id, curriculum_template_items(count)')
      .eq('workspace_id', workspaceId)
      .eq('active', true)
      .order('name'),
  ])

  const scopes: ScopeOption[] = ((scopeRows ?? []) as { id: string; name: string }[]).map(s => ({
    id: s.id,
    name: s.name,
  }))

  const templates: TemplateOption[] = (
    (templateRows ?? []) as unknown as {
      id: string
      name: string
      scope_id: string
      curriculum_template_items: Nested<{ count: number }>
    }[]
  ).map(t => ({
    id: t.id,
    name: t.name,
    scopeId: t.scope_id,
    itemCount: one(t.curriculum_template_items)?.count ?? 0,
  }))

  // `?scope=` eksikse (ör. Genel Bakış'tan scope'suz bir linkle gelindiyse)
  // scopes[0]'a değil, AKIŞI OLAN ilk scope'a düşülür — aksi halde
  // öğretmen doğru derste şablon uygulamış olsa da ekran flowsuz başka bir
  // dersin sekmesinde açılabilir ("Bu derste henüz akış yok" yanlış mesajı,
  // M1.0-06 P0 bug'ının kök nedeni).
  let activeScopeId =
    rawScope && scopes.some(s => s.id === rawScope) ? rawScope : null

  if (!activeScopeId && scopes.length > 0) {
    const { data: scopesWithFlowRows } = await supabase
      .from('student_curriculum_items')
      .select('scope_id')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .limit(500)
    const scopesWithFlow = new Set(
      (scopesWithFlowRows ?? []).map(r => r.scope_id as string),
    )
    activeScopeId =
      scopes.find(s => scopesWithFlow.has(s.id))?.id ?? scopes[0]?.id ?? null
  }

  let initialItems: FlowItem[] = []
  // "İşleniyor" durumu için: konuda açık ödev kalemi var mı? Koruma Havuzu
  // ile ORTAK yükleyici (lib/open-work.ts).
  let openWorkTopicIds: string[] = []

  if (activeScopeId) {
    const { data: itemRows, error: itemsError } = await supabase
      .from('student_curriculum_items')
      .select('id, topic_id, start_date, end_date, passed_at, note, topics(name)')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .eq('scope_id', activeScopeId)
      .order('sort_order')

    if (itemsError) {
      console.error('student_curriculum_items yüklenemedi', itemsError)
    }

    initialItems = (
      (itemRows ?? []) as unknown as {
        id: string
        topic_id: string
        start_date: string
        end_date: string
        passed_at: string | null
        note: string | null
        topics: Nested<{ name: string }>
      }[]
    ).map(row => ({
      id: row.id,
      topicId: row.topic_id,
      name: one(row.topics)?.name ?? 'Konu',
      startDate: row.start_date,
      endDate: row.end_date,
      // Durum SAKLANMAZ, türetilir: yalnız "Geçildi" bir gerçek işarettir.
      passed: row.passed_at !== null,
      note: row.note,
    }))

    openWorkTopicIds = [
      ...(await loadOpenWorkTopicIds(supabase, {
        workspaceId,
        studentId,
        topicIds: initialItems.map(i => i.topicId).filter((t): t is string => !!t),
      })),
    ]
  }

  // M1.0-06: "Kitap kapsamı" / "Son temas" sütunları. Sunucu bileşeninden
  // istemciye Map geçirilemez — düz nesneye çevrilir.
  const topicCoverageMap = await loadTopicCoverage(supabase, {
    workspaceId,
    studentId,
    topicIds: initialItems.map(i => i.topicId).filter((t): t is string => !!t),
  })
  const topicCoverage: Record<string, TopicCoverage> = Object.fromEntries(topicCoverageMap)

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
      <PageHeader
        // BAŞLIKTA ÖĞRENCİ ADI YOK (067): ad, sınıf ve sınav rozetleri
        // artık çalışma masasının üst şeridinde — sekmelerle birlikte
        // gezinme boyunca yerinde duruyor. Burada tekrarlamak, aynı bilgiyi
        // ekranda iki kez göstermek olurdu. Geri düğmesi de gereksiz:
        // "Genel Bakış" bir sekme.
        title="Müfredat Akışı"
        subtitle="Öğrencinin kişisel akademik akışı. Konuların zamanını düzenler, ileri/geri taşır, ekler veya çıkarırsınız."
      />

      <CurriculumFlowEditor
        studentId={studentId}
        scopes={scopes}
        activeScopeId={activeScopeId}
        templates={templates}
        initialItems={initialItems}
        openWorkTopicIds={openWorkTopicIds}
        topicCoverage={topicCoverage}
      />
    </div>
  )
}
