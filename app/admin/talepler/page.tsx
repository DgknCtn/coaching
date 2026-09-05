import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import { ticketCategoryLabel, ticketStatusLabel, ticketStatusVariant } from '@/lib/support'
import { AdminTicket } from './admin-ticket'

export const metadata: Metadata = { title: 'Destek Talepleri' }
export const dynamic = 'force-dynamic'

// DESTEK TALEPLERİ — yönetim görünümü.
//
// Sıralama RPC'de: açık talepler üstte, sonra en son hareket eden.
// Sıralamayı burada yapmak, sayfalama eklendiğinde yanlış sonuç
// üretirdi — ilk 100 kayıt alınıp sonra sıralanmış olurdu.

interface TicketRow {
  ticket_id: string
  workspace_name: string
  opened_by: string | null
  subject: string
  category: string
  status: string
  priority: string
  message_count: number
  last_message_at: string
  created_at: string
}

export default async function AdminTicketsPage() {
  const supabase = await createClient()

  const { data } = await supabase.rpc('admin_list_tickets', {
    p_status: null,
    p_limit: 200,
  })

  const rows = (data ?? []) as unknown as TicketRow[]
  const open = rows.filter((r) => r.status !== 'closed')
  const closed = rows.filter((r) => r.status === 'closed')

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Açık talepler{' '}
            <span className="font-normal text-muted-foreground">({open.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {open.length === 0 ? (
            <p className="text-sm text-muted-foreground">Açık talep yok.</p>
          ) : (
            <div className="divide-y">
              {open.map((t) => (
                <AdminTicket
                  key={t.ticket_id}
                  ticketId={t.ticket_id}
                  subject={t.subject}
                  workspaceName={t.workspace_name}
                  openedBy={t.opened_by}
                  category={ticketCategoryLabel(t.category)}
                  statusLabel={ticketStatusLabel(t.status)}
                  statusVariant={ticketStatusVariant(t.status)}
                  messageCount={t.message_count}
                  lastMessageAt={t.last_message_at}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {closed.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Kapatılanlar{' '}
              <span className="font-normal text-muted-foreground">({closed.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {closed.map((t) => (
                <div
                  key={t.ticket_id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.workspace_name} ·{' '}
                      {new Date(t.last_message_at).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                  <Badge variant="neutral">Kapatıldı</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
