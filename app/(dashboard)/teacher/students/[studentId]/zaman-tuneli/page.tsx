import { notFound } from 'next/navigation'
import { getTeacherContext } from '@/lib/workspace'
import { buildTimeline, loadTimelineSources, type TimelineCategory } from '@/lib/activity-timeline'
import { TimelineList } from './timeline-list'

// ÖĞRENCİ ZAMAN TÜNELİ (Feature Showcase PRD 10.1 · Faz 2c). Son 90 günün
// ödev, ders, görüşme, ödeme ve not kayıtları tek kronolojide. Yalnız
// var olan kayıtlar — türetilmiş yorum yok.

export const dynamic = 'force-dynamic'

const DAYS = 90

export default async function StudentTimelinePage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  const { supabase, workspaceId, role } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!student) notFound()

  const events = buildTimeline(await loadTimelineSources(supabase, { workspaceId, studentId, days: DAYS }))
  // Ödemeler yalnız sahibe (finans RLS'i); öğretmende süzgeçte de yok.
  const categories: TimelineCategory[] =
    role === 'owner' ? ['akademik', 'ders', 'gorusme', 'odeme', 'not'] : ['akademik', 'ders', 'gorusme', 'not']

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <div>
        <h2 className="text-base font-semibold">Zaman Tüneli</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Son {DAYS} gün: verilen ödevler, teslim ve onaylar, dersler, görüşmeler{role === 'owner' ? ', ödemeler' : ''} ve
          notlarınız tek akışta.
        </p>
      </div>
      <TimelineList events={events} categories={categories} />
    </div>
  )
}
