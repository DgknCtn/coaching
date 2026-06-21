import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Plus, BookOpen, ClipboardList, Users, StickyNote, AlertTriangle } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AssignBookDialog } from './assign-book-dialog'
import { InviteDialog } from './invite-dialog'

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

  // Book progress
  const { data: bookProgress } = await supabase
    .from('student_book_progress_view')
    .select('*')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)

  // Homework batches
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

  // Parent links
  const { data: parentLinks } = await supabase
    .from('parent_student_links')
    .select('id, relationship_type, status, parent_profile_id, profiles(full_name, email)')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .neq('status', 'removed')

  // Books available to assign (not yet assigned in active term)
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

  // Weekly summary
  const { data: weeklySummary } = await supabase
    .from('student_weekly_homework_summary_view')
    .select('*')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  const hasAccount = !!student.profile_id

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Link href="/teacher/students">
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{student.full_name}</h1>
              {student.exam_type && <Badge variant="secondary">{student.exam_type}</Badge>}
              {student.grade_level && <Badge variant="outline">{student.grade_level}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {student.email ?? ''}{student.phone ? ` · ${student.phone}` : ''}
            </p>
          </div>
        </div>
        <Link href={`/teacher/students/${studentId}/homework/new`}>
          <Button size="sm">
            <Plus className="size-4" /> Ödev Ver
          </Button>
        </Link>
      </div>

      {/* Weekly summary cards */}
      {weeklySummary && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Verilen', value: weeklySummary.assigned_tests },
            { label: 'Tamamlanan', value: weeklySummary.completed_tests },
            { label: 'Bekleyen', value: weeklySummary.pending_tests },
            { label: 'Geciken', value: weeklySummary.overdue_tests, alert: Number(weeklySummary.overdue_tests) > 0 },
          ].map(({ label, value, alert }) => (
            <Card key={label} className={alert ? 'border-red-200 bg-red-50' : ''}>
              <CardContent className="pt-3 pb-3 text-center">
                <p className={`text-2xl font-bold ${alert ? 'text-red-600' : ''}`}>{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs defaultValue="books">
        <TabsList className="mb-4">
          <TabsTrigger value="books">
            <BookOpen className="size-3.5 mr-1" /> Kitaplar
          </TabsTrigger>
          <TabsTrigger value="homework">
            <ClipboardList className="size-3.5 mr-1" /> Ödevler
          </TabsTrigger>
          <TabsTrigger value="parents">
            <Users className="size-3.5 mr-1" /> Veliler
          </TabsTrigger>
          {student.notes && (
            <TabsTrigger value="notes">
              <StickyNote className="size-3.5 mr-1" /> Notlar
            </TabsTrigger>
          )}
        </TabsList>

        {/* BOOKS TAB */}
        <TabsContent value="books">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-sm">Atanmış Kitaplar</h2>
            {activeTerm && availableBooks.length > 0 && (
              <AssignBookDialog
                studentId={studentId}
                books={availableBooks}
              />
            )}
          </div>
          {!bookProgress?.length ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Henüz kitap atanmamış.
              {activeTerm && availableBooks.length > 0 && ' Kitap eklemek için "Kitap Ata" butonunu kullanın.'}
              {!activeTerm && ' Önce aktif bir dönem oluşturun.'}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {bookProgress.map((p) => (
                <Card key={p.student_book_assignment_id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <Link href={`/teacher/books/${p.book_id}`} className="font-medium text-sm hover:underline">
                          {p.book_title}
                        </Link>
                        <p className="text-xs text-muted-foreground">{p.subject}</p>
                      </div>
                      {p.exam_type && <Badge variant="secondary" className="text-xs shrink-0">{p.exam_type}</Badge>}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{p.completed_tests} / {p.total_tests} test</span>
                        <span>{p.completion_percentage}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${Math.min(100, Number(p.completion_percentage))}%` }}
                        />
                      </div>
                      {p.target_end_date && (
                        <p className="text-xs text-muted-foreground">
                          Hedef: {new Date(p.target_end_date).toLocaleDateString('tr-TR')}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* HOMEWORK TAB */}
        <TabsContent value="homework">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-sm">Ödevler</h2>
            <Link href={`/teacher/students/${studentId}/homework/new`}>
              <Button size="xs" variant="outline">
                <Plus className="size-3" /> Ödev Ver
              </Button>
            </Link>
          </div>
          {!homeworkBatches?.length ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Henüz ödev yok.</div>
          ) : (
            <div className="space-y-2">
              {homeworkBatches.map((batch) => {
                const items = batch.homework_items as { id: string; status: string }[] ?? []
                const total = items.length
                const completed = items.filter(i => i.status === 'completed').length
                const isOverdue = new Date(batch.due_date) < new Date() && items.some(i => i.status === 'pending')
                return (
                  <Card key={batch.id} className={isOverdue ? 'border-red-200' : ''}>
                    <CardContent className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium">
                          {batch.title ?? new Date(batch.due_date).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-muted-foreground">
                            Teslim: {new Date(batch.due_date).toLocaleDateString('tr-TR')}
                          </p>
                          {isOverdue && (
                            <span className="text-xs text-red-600 flex items-center gap-0.5">
                              <AlertTriangle className="size-3" /> Gecikmiş
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{completed}/{total}</p>
                        <p className="text-xs text-muted-foreground">tamamlandı</p>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* PARENTS TAB */}
        <TabsContent value="parents">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-sm">Veliler</h2>
            <InviteDialog
              studentId={studentId}
              studentName={student.full_name}
              inviteType="parent"
            />
          </div>
          {!hasAccount && (
            <div className="mb-3">
              <InviteDialog
                studentId={studentId}
                studentName={student.full_name}
                inviteType="student"
              />
            </div>
          )}
          {!parentLinks?.length ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Bağlı veli yok.</div>
          ) : (
            <div className="space-y-2">
              {parentLinks.map((link) => {
                const profile = link.profiles as unknown as { full_name: string; email: string } | null
                return (
                  <Card key={link.id}>
                    <CardContent className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium">{profile?.full_name ?? 'Davet bekleniyor'}</p>
                        <p className="text-xs text-muted-foreground">{profile?.email ?? ''}</p>
                      </div>
                      <Badge variant={link.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                        {link.status === 'active' ? 'Aktif' : link.status === 'invited' ? 'Davet edildi' : link.status}
                      </Badge>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {student.notes && (
          <TabsContent value="notes">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm whitespace-pre-wrap">{student.notes}</p>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
