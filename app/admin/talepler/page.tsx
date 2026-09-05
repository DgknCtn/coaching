import type { Metadata } from 'next'
import Link from 'next/link'
import { LifeBuoy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { EmptyState } from '@/components/shared/empty-state'
import { createClient } from '@/lib/supabase/server'
import { ticketCategoryLabel, ticketStatusLabel, ticketStatusVariant } from '@/lib/support'
import { formatRelativeTr, formatDateTr } from '@/lib/format'
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

/**
 * "Kaç gündür bekliyor" — açık taleplerin gerçek önceliği.
 *
 * Liste son hareket zamanına göre sıralı ama ekranda yalnız bir tarih
 * yazıyordu; 3 gündür yanıtsız duran bir talebi 3 saatlik olandan ayırmak
 * için okuyanın kafadan çıkarma yapması gerekiyordu.
 */
function waitingDays(lastMessageAt: string): number {
  const ms = Date.now() - new Date(lastMessageAt).getTime()
  return Math.floor(ms / 86_400_000)
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

  // BEKLEYENLER AYRI BİR BÖLÜM DEĞİL, BİR ROZET: talebi listeden ayırmak
  // aynı talebi iki yerde aramaya yol açardı. Eşik 2 gün — bir iş günü
  // içinde dönülen bir talep gecikmiş sayılmamalı.
  const stale = open.filter((t) => waitingDays(t.last_message_at) >= 2).length

  return (
    <div className="space-y-8">
      <PageHeader
        title="Destek Talepleri"
        subtitle={
          open.length === 0
            ? 'Açık talep yok.'
            : stale > 0
              ? `${open.length} açık talep · ${stale} tanesi 2 günden uzun süredir yanıtsız`
              : `${open.length} açık talep`
        }
        className="mb-0"
      />

      <Section title={`Açık talepler (${open.length})`} variant="card">
        {open.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="Açık talep yok"
            description="Yeni bir destek talebi geldiğinde burada görünür."
          />
        ) : (
          <div className="divide-y px-4">
            {open.map((t) => {
              const days = waitingDays(t.last_message_at)
              return (
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
                  lastMessageLabel={formatRelativeTr(t.last_message_at)}
                  // Rozet yalnız gerçekten geciken taleplerde. Her satırda
                  // bir uyarı, hiçbir satırda uyarı olmamasıyla aynı şey.
                  waitingLabel={days >= 2 ? `${days} gündür yanıtsız` : undefined}
                />
              )
            })}
          </div>
        )}
      </Section>

      {closed.length > 0 && (
        <Section title={`Kapatılanlar (${closed.length})`} variant="card">
          <div className="divide-y px-4">
            {closed.map((t) => (
              <div
                key={t.ticket_id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.workspace_name} · {formatDateTr(t.last_message_at)}
                  </p>
                </div>
                <Badge variant="neutral">Kapatıldı</Badge>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Açık talep sayısı özet ekranında da yazıyor; oradan buraya
          bağlantı vardı ama tersi yoktu. */}
      <p className="text-xs text-muted-foreground">
        Çalışma alanı ayrıntısı için{' '}
        <Link href="/admin" className="underline underline-offset-4 hover:text-foreground">
          Özet
        </Link>{' '}
        ekranındaki listeyi kullanın.
      </p>
    </div>
  )
}
