import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { getTeacherContext } from '@/lib/workspace'
import { ticketStatusLabel, ticketStatusVariant } from '@/lib/support'
import { TicketThread } from './ticket-thread'

export const metadata: Metadata = { title: 'Destek Talebi' }

export default async function TicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>
}) {
  const { ticketId } = await params
  const { supabase } = await getTeacherContext()

  // RLS zaten başka çalışma alanının talebini döndürmez; burada ek bir
  // filtre gerekmiyor. Yoksa 404.
  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('id, subject, category, status, created_at')
    .eq('id', ticketId)
    .maybeSingle()

  if (!ticket) notFound()

  const { data: messages } = await supabase
    .from('support_messages')
    .select('id, author_name, body, is_staff, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })

  const statusLabel = ticketStatusLabel(ticket.status)
  const statusVariant = ticketStatusVariant(ticket.status)

  return (
    // SAYFA SARMALAYICISI (067): bu üç ekran bare <div> ile açılıyordu ve
    // diğer bütün öğretmen sayfalarından farklı olarak içeriği kenara
    // yapışık, genişliği sınırsız çiziyordu. Ölçüler teacher/students ve
    // teacher/finans ile aynı.
    <div className="max-w-4xl space-y-8 p-6 md:p-8">
      <PageHeader
        title={ticket.subject}
        backHref="/teacher/destek"
        badges={<Badge variant={statusVariant}>{statusLabel}</Badge>}
      />

      <TicketThread
        ticketId={ticket.id}
        closed={ticket.status === 'closed'}
        messages={(messages ?? []).map((m) => ({
          id: m.id,
          authorName: m.author_name,
          body: m.body,
          isStaff: m.is_staff,
          createdAt: m.created_at,
        }))}
      />
    </div>
  )
}
