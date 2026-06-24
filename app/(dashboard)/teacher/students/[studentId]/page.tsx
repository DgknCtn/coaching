import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus, BookOpen, ClipboardList, Users, StickyNote, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AssignBookDialog } from './assign-book-dialog'
import { InviteDialog } from './invite-dialog'
import { StatCard } from '@/components/shared/stat-card'
import { BookCard } from '@/components/shared/book-card'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
  const { supabase, workspaceId, activeTerm } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, email, phone, grade_level, exam_type, notes, status, profile_id')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!student || student.status === 'archived') notFound()

  const { data: bookProgress } = await supabase
    .from('student_book_progress_view')
    .select('*')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)

  const { data: homeworkBatches } = await supabase
    .from('homework_batches')
    .select(`
      id, title, due_date, status,
      homework_items(id, status)
    `)
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .order('due_date', { ascending: false })
    .limit(20)

  const { data: parentLinks } = await supabase
    .from('parent_student_links')
    .select('id, relationship_type, status, parent_profile_id, profiles(full_name, email)')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .neq('status', 'removed')

  const assignedBookIds = (bookProgress ?? []).map(p => p.book_id)
  let availableBooks: { id: string; title: string; subject: string }[] = []
  if (activeTerm) {
    const { data } = await supabase
      .from('books')
      .select('id, title, subject')
      .eq('workspace_id', workspaceId)
      .eq('academic_term_id', activeTerm.id)
      .eq('status', 'active')
    availableBooks = (data ?? []).filter(b => !assignedBookIds.includes(b.id))
  }

  const { data: weeklySummary } = await supabase
    .from('student_weekly_homework_summary_view')
    .select('*')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  const hasAccount = !!student.profile_id

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <PageHeader
        backHref="/teacher/students"
        title={student.full_name}
        subtitle={[student.email, student.phone].filter(Boolean).join(' · ')}
        badges={
          <>
            {student.exam_type && <Badge variant="secondary" className="rounded-lg">{student.exam_type}</Badge>}
            {student.grade_level && <Badge variant="outline" className="rounded-lg">{student.grade_level}</Badge>}
          </>
        }
        action={
          <Link href={`/teacher/students/${studentId}/homework/new`}>
            <Button
              size="sm"
              className="gap-2 rounded-xl h-9 font-semibold shadow-sm"
              style={{ background: 'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))' }}
            >
              <Plus className="size-4" /> Ödev Ver
            </Button>
          </Link>
        }
      />

      {/* Weekly summary cards */}
      {weeklySummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={ClipboardList}
            label="Verilen"
            value={weeklySummary.assigned_tests ?? 0}
            colorScheme="indigo"
          />
          <StatCard
            icon={CheckCircle2}
            label="Tamamlanan"
            value={weeklySummary.completed_tests ?? 0}
            colorScheme="emerald"
          />
          <StatCard
            icon={ClipboardList}
            label="Bekleyen"
            value={weeklySummary.pending_tests ?? 0}
            colorScheme="neutral"
          />
          <StatCard
            icon={AlertTriangle}
            label="Geciken"
            value={weeklySummary.overdue_tests ?? 0}
            colorScheme={Number(weeklySummary.overdue_tests) > 0 ? 'red' : 'neutral'}
          />
        </div>
      )}

      <Tabs defaultValue="books">
        <TabsList className="mb-6 h-10 rounded-xl p-1 bg-muted">
          <TabsTrigger value="books" className="gap-1.5 rounded-lg text-xs font-semibold">
            <BookOpen className="size-3.5" /> Kitaplar
          </TabsTrigger>
          <TabsTrigger value="homework" className="gap-1.5 rounded-lg text-xs font-semibold">
            <ClipboardList className="size-3.5" /> Ödevler
          </TabsTrigger>
          <TabsTrigger value="parents" className="gap-1.5 rounded-lg text-xs font-semibold">
            <Users className="size-3.5" /> Veliler
          </TabsTrigger>
          {student.notes && (
            <TabsTrigger value="notes" className="gap-1.5 rounded-lg text-xs font-semibold">
              <StickyNote className="size-3.5" /> Notlar
            </TabsTrigger>
          )}
        </TabsList>

        {/* BOOKS TAB */}
        <TabsContent value="books">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-sm text-foreground">Atanmış Kitaplar</h2>
            {activeTerm && availableBooks.length > 0 && (
              <AssignBookDialog studentId={studentId} books={availableBooks} />
            )}
          </div>
          {!bookProgress?.length ? (
            <div className="bg-card rounded-2xl border shadow-xs">
              <EmptyState
                icon={BookOpen}
                title="Henüz kitap atanmamış"
                description={
                  activeTerm && availableBooks.length > 0
                    ? 'Kitap eklemek için "Kitap Ata" butonunu kullanın.'
                    : !activeTerm
                    ? 'Önce aktif bir dönem oluşturun.'
                    : 'Bu dönemdeki tüm kitaplar atanmış.'
                }
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {bookProgress.map((p) => (
                <BookCard
                  key={p.student_book_assignment_id}
                  book={{
                    id: p.book_id,
                    title: p.book_title,
                    subject: p.subject,
                    exam_type: p.exam_type,
                  }}
                  progress={{
                    completed: p.completed_tests,
                    total: p.total_tests,
                    percentage: Number(p.completion_percentage),
                    targetDate: p.target_end_date,
                  }}
                  href={`/teacher/books/${p.book_id}`}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* HOMEWORK TAB */}
        <TabsContent value="homework">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-sm">Ödevler</h2>
            <Link href={`/teacher/students/${studentId}/homework/new`}>
              <Button size="sm" variant="outline" className="gap-1.5 rounded-xl h-9 font-semibold">
                <Plus className="size-3" /> Ödev Ver
              </Button>
            </Link>
          </div>
          {!homeworkBatches?.length ? (
            <div className="bg-card rounded-2xl border shadow-xs">
              <EmptyState
                icon={ClipboardList}
                title="Henüz ödev yok"
                description="Bu öğrenciye ödev vererek takip etmeye başlayın."
                action={{ label: 'Ödev Ver', href: `/teacher/students/${studentId}/homework/new` }}
              />
            </div>
          ) : (
            <div className="space-y-2.5">
              {homeworkBatches.map((batch) => {
                const items = batch.homework_items as { id: string; status: string }[] ?? []
                const total = items.length
                const completed = items.filter(i => i.status === 'completed').length
                const isOverdue = new Date(batch.due_date) < new Date() && items.some(i => i.status === 'pending')
                const pct = total > 0 ? Math.round((completed / total) * 100) : 0
                const isComplete = total > 0 && completed === total
                return (
                  <div
                    key={batch.id}
                    className={cn(
                      'bg-card rounded-2xl border px-5 py-4 flex items-center justify-between gap-4 shadow-xs transition-all',
                      isOverdue && 'border-l-[3px] border-l-red-400',
                      isComplete && 'border-l-[3px] border-l-emerald-400',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-bold truncate">
                          {batch.title ?? new Date(batch.due_date).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </p>
                        {isOverdue && (
                          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-red-600 font-bold">
                            <AlertTriangle className="size-3" /> Gecikmiş
                          </span>
                        )}
                        {isComplete && (
                          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-emerald-600 font-bold">
                            <CheckCircle2 className="size-3" /> Tamamlandı
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Teslim: {new Date(batch.due_date).toLocaleDateString('tr-TR')}
                      </p>
                      {total > 0 && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[100px]">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                background: isOverdue
                                  ? 'oklch(0.54 0.22 20)'
                                  : isComplete
                                  ? 'oklch(0.50 0.18 155)'
                                  : 'linear-gradient(90deg, oklch(0.57 0.26 282), oklch(0.65 0.22 300))',
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground font-semibold">{pct}%</span>
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black">
                        {completed}
                        <span className="text-muted-foreground text-sm font-normal">/{total}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground font-medium">tamamlandı</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* PARENTS TAB */}
        <TabsContent value="parents">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-sm">Veliler</h2>
            <InviteDialog
              studentId={studentId}
              studentName={student.full_name}
              inviteType="parent"
            />
          </div>
          {!hasAccount && (
            <div className="mb-4">
              <InviteDialog
                studentId={studentId}
                studentName={student.full_name}
                inviteType="student"
              />
            </div>
          )}
          {!parentLinks?.length ? (
            <div className="bg-card rounded-2xl border shadow-xs">
              <EmptyState
                icon={Users}
                title="Bağlı veli yok"
                description="Veli davet ederek takip sürecine dahil edin."
              />
            </div>
          ) : (
            <div className="space-y-2.5">
              {parentLinks.map((link) => {
                const prof = link.profiles as unknown as { full_name: string; email: string } | null
                return (
                  <div key={link.id} className="bg-card rounded-2xl border px-5 py-4 flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 ring-1 ring-border">
                        <span className="text-sm font-black text-muted-foreground">
                          {(prof?.full_name ?? 'V').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-bold">{prof?.full_name ?? 'Davet bekleniyor'}</p>
                        <p className="text-xs text-muted-foreground">{prof?.email ?? ''}</p>
                      </div>
                    </div>
                    <Badge
                      variant={link.status === 'active' ? 'default' : 'secondary'}
                      className="text-xs rounded-lg"
                    >
                      {link.status === 'active' ? 'Aktif' : link.status === 'invited' ? 'Davet edildi' : link.status}
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {student.notes && (
          <TabsContent value="notes">
            <div className="bg-card rounded-2xl border shadow-xs p-6">
              <p className="text-sm whitespace-pre-wrap text-foreground/80 leading-relaxed">{student.notes}</p>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
