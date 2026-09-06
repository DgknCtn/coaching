import type { Metadata } from 'next'
import { Library } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { EmptyState } from '@/components/shared/empty-state'
import { formatRelativeTr } from '@/lib/format'
import { unitLabel } from '@/lib/unit-labels'
import { SubmissionRow } from './submission-row'
import { LibrarySetup } from './library-setup'

export const metadata: Metadata = { title: 'Kaynak Kütüphanesi' }
export const dynamic = 'force-dynamic'

// KÜTÜPHANE YÖNETİMİ (069).
//
// İki iş burada: (1) kütüphane çalışma alanını kurmak, (2) koçlardan gelen
// önerileri karara bağlamak. Kütüphaneye kitap GİRMEK burada yapılmaz —
// alan kurulduktan sonra yönetici çalışma alanı seçicisinden kütüphaneye
// geçer ve kitabı olağan kitap formuyla ekler. İkinci bir kitap giriş
// ekranı yazmak, aynı formun iki sürümünü bakmak demekti.

interface SubmissionRowData {
  book_id: string
  workspace_name: string
  submitted_by: string | null
  title: string
  subject: string
  publisher: string | null
  level_exam: string | null
  edition_year: number | null
  resource_type: string | null
  tracking_mode: string | null
  section_count: number
  unit_count: number
  library_status: string
  review_note: string | null
  updated_at: string
}

export default async function AdminLibraryPage() {
  const supabase = await createClient()

  const [{ data: submissions }, { data: libraryWorkspaceId }] = await Promise.all([
    // p_status null: karara bağlanmışlar da listelenir, "ne oldu?" sorusu
    // ayrı bir yerde aranmasın. RPC bekleyenleri en üste sıralar.
    supabase.rpc('admin_list_library_submissions', { p_status: null, p_limit: 200 }),
    supabase.rpc('library_workspace_id'),
  ])

  const rows = (submissions ?? []) as unknown as SubmissionRowData[]
  const pending = rows.filter((r) => r.library_status === 'pending')

  // Kütüphanede kaç kaynak yayında? Yöneticinin "aktardım, oldu mu?"
  // sorusunun cevabı ekranda dursun; koç tarafına geçip bakmak
  // gerekmesin.
  const { count: libraryBookCount } = libraryWorkspaceId
    ? await supabase
        .from('books')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', libraryWorkspaceId as string)
        .eq('status', 'active')
        .eq('library_status', 'approved')
    : { count: 0 }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Kaynak Kütüphanesi"
        subtitle={
          pending.length === 0
            ? 'Bekleyen öneri yok.'
            : `${pending.length} öneri karar bekliyor.`
        }
      />

      <LibrarySetup
        libraryWorkspaceId={(libraryWorkspaceId as string | null) ?? null}
        bookCount={libraryBookCount ?? 0}
      />

      <Section title="Koç önerileri" variant="card">
        {rows.length === 0 ? (
          <EmptyState
            icon={Library}
            title="Henüz öneri yok"
            description="Koçlar kendi kaynaklarını kütüphaneye önerdiğinde burada listelenir."
          />
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <SubmissionRow
                key={row.book_id}
                bookId={row.book_id}
                title={row.title}
                workspaceName={row.workspace_name}
                submittedBy={row.submitted_by}
                meta={[
                  row.publisher,
                  row.subject,
                  row.level_exam,
                  row.resource_type && row.resource_type !== 'Belirtilmedi'
                    ? row.resource_type
                    : null,
                  row.edition_year != null ? String(row.edition_year) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                sectionCount={row.section_count}
                unitCount={row.unit_count}
                unitLabel={unitLabel(row.tracking_mode)}
                libraryStatus={row.library_status}
                reviewNote={row.review_note}
                updatedLabel={formatRelativeTr(row.updated_at)}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
