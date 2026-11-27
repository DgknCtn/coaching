import Link from 'next/link'
import { getStudentContext } from '@/lib/workspace'
import { todayDateString } from '@/lib/homework-status'
import { loadMistakeData } from '@/lib/mistakes/load'
import { todayStats } from '@/lib/mistakes/today'
import { buttonVariants } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { MistakeList } from '@/components/mistakes/mistake-list'
import { MistakeAnalysis } from '@/components/mistakes/mistake-analysis'
import { ModuleUnavailable } from '@/components/mistakes/module-unavailable'
import { cn } from '@/lib/utils'
import { deleteMistakeAction, setMistakeArchivedAction } from './actions'

// HATA DEFTERİM — öğrencinin yanlış yaptığı soruları ve aralıklı tekrarı.
// Mevcut "Tekrar" ekranı (konu tekrarı, Koruma Havuzu) AYRI bir şeydir;
// bu ekran SORU tekrarıdır.

export const dynamic = 'force-dynamic'

export default async function MistakeNotebookPage({ searchParams }: { searchParams: Promise<{ sekme?: string }> }) {
  const { sekme } = await searchParams
  const tab = sekme === 'analiz' ? 'analiz' : 'hatalar'
  const { supabase, student, workspaceId } = await getStudentContext()
  const today = todayDateString()
  const data = await loadMistakeData(supabase, { workspaceId, studentId: student.id })

  const due = data ? todayStats(data, today).due : 0
  const archive = async (id: string) => {
    'use server'
    return setMistakeArchivedAction(id, true)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Hata Defterim"
        subtitle="Yanlış yaptığın soruları kaydet; unutmaman için doğru günlerde yeniden karşına çıkaralım."
        action={
          data && (
            <div className="flex gap-2">
              <Link
                href="/student/hata-defteri/tekrar"
                className={buttonVariants({ variant: due ? 'default' : 'outline', size: 'sm' })}
              >
                Tekrara başla{due ? ` (${due})` : ''}
              </Link>
              <Link href="/student/hata-defteri/yeni" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Hata ekle
              </Link>
            </div>
          )
        }
        className="mb-0"
      />
      {!data ? (
        <ModuleUnavailable />
      ) : (
        <>
          <nav className="flex gap-4 border-b text-sm" aria-label="Hata defteri bölümleri">
            {(
              [
                ['hatalar', 'Hatalar', '/student/hata-defteri'],
                ['analiz', 'Analiz', '/student/hata-defteri?sekme=analiz'],
              ] as const
            ).map(([k, label, href]) => (
              <Link
                key={k}
                href={href}
                aria-current={tab === k ? 'page' : undefined}
                className={cn('-mb-px border-b-2 px-1 pb-2', tab === k ? 'border-primary font-medium' : 'border-transparent text-muted-foreground')}
              >
                {label}
              </Link>
            ))}
          </nav>
          {tab === 'analiz' ? (
            <MistakeAnalysis data={data} today={today} audience="student" />
          ) : (
            <MistakeList
              mistakes={data.mistakes}
              today={today}
              role="student"
              actions={{ onArchive: archive, onDelete: deleteMistakeAction }}
            />
          )}
        </>
      )}
    </div>
  )
}
