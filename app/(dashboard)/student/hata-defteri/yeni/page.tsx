import { getStudentContext } from '@/lib/workspace'
import { loadMistakeFormOptions } from '@/lib/mistakes/load'
import { examTagsFor } from '@/lib/mistakes/net'
import { PageHeader } from '@/components/shared/page-header'
import { MistakeForm } from '@/components/mistakes/mistake-form'
import { createMistakeAction } from '../actions'

// HATA EKLE. ?kitap=&test= ile ödev kartından gelindiğinde kaynak dolu açılır.

export const dynamic = 'force-dynamic'

export default async function NewMistakePage({ searchParams }: { searchParams: Promise<{ kitap?: string; test?: string }> }) {
  const { kitap, test } = await searchParams
  const { supabase, student, workspaceId } = await getStudentContext()
  const options = await loadMistakeFormOptions(supabase, { workspaceId, studentId: student.id })

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <PageHeader title="Hata ekle" subtitle="Bir dakikada kaydet; ilk tekrarı bugün." backHref="/student/hata-defteri" className="mb-0" />
      <MistakeForm
        workspaceId={workspaceId}
        studentId={student.id}
        examTags={examTagsFor(student.exam_type)}
        options={options}
        onSubmit={createMistakeAction}
        doneHref="/student/hata-defteri"
        defaults={{ bookId: kitap, bookTestId: test }}
      />
    </div>
  )
}
