import { getStudentContext } from '@/lib/workspace'
import { todayDateString } from '@/lib/homework-status'
import { loadMistakeData } from '@/lib/mistakes/load'
import { isDue } from '@/lib/mistakes/srs'
import { PageHeader } from '@/components/shared/page-header'
import { ReviewSession } from '@/components/mistakes/review-session'
import { ModuleUnavailable } from '@/components/mistakes/module-unavailable'
import { finishReviewAction, reviewMistakeAction } from '../actions'

// SORU TEKRARI — bugün (ya da daha önce) tekrarı gelen hatalar, en eski
// tarihliden başlayarak. Tek oturumda en fazla 50 kart.

export const dynamic = 'force-dynamic'

const SESSION_LIMIT = 50

export default async function ReviewPage() {
  const { supabase, student, workspaceId } = await getStudentContext()
  const today = todayDateString()
  const data = await loadMistakeData(supabase, { workspaceId, studentId: student.id, days: 1 })
  const items = (data?.mistakes ?? [])
    .filter(m => isDue({ status: m.status, nextReviewOn: m.next_review_on }, today))
    .sort((a, b) => (a.next_review_on ?? '').localeCompare(b.next_review_on ?? '') || a.created_at.localeCompare(b.created_at))
    .slice(0, SESSION_LIMIT)

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <PageHeader title="Soru tekrarı" backHref="/student/hata-defteri" className="mb-0" />
      {data ? (
        <ReviewSession items={items} onReview={reviewMistakeAction} onFinish={finishReviewAction} doneHref="/student/hata-defteri" />
      ) : (
        <ModuleUnavailable />
      )}
    </div>
  )
}
