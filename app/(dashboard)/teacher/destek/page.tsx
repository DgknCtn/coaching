import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getTeacherContext } from '@/lib/workspace'
import { NewTicketForm } from './new-ticket-form'

export const metadata: Metadata = { title: 'Destek' }

const STATUS: Record<string, { label: string; variant: 'info' | 'success' | 'neutral' }> = {
  open: { label: 'Yanıt bekliyor', variant: 'info' },
  answered: { label: 'Yanıtlandı', variant: 'success' },
  closed: { label: 'Kapatıldı', variant: 'neutral' },
}

const CATEGORY: Record<string, string> = {
  genel: 'Genel',
  teknik: 'Teknik',
  odeme: 'Ödeme',
  oneri: 'Öneri',
}

export default async function SupportPage() {
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: tickets } = await supabase
    .from('support_tickets')
    .select('id, subject, category, status, last_message_at, created_at')
    .eq('workspace_id', workspaceId)
    .order('last_message_at', { ascending: false })
    .limit(50)

  const rows = tickets ?? []

  return (
    <div>
      <PageHeader
        title="Destek"
        subtitle="Bir sorunuz ya da sorununuz mu var? Talep açın, size buradan dönelim."
      />

      <div className="space-y-6">
        <NewTicketForm />

        <div>
          <h2 className="mb-3 text-base font-medium">Talepleriniz</h2>
          {rows.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Henüz bir destek talebiniz yok.
              </CardContent>
            </Card>
          ) : (
            <div className="divide-y rounded-lg border bg-card">
              {rows.map((t) => {
                const status = STATUS[t.status] ?? STATUS.open
                return (
                  <Link
                    key={t.id}
                    href={`/teacher/destek/${t.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.subject}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {CATEGORY[t.category] ?? t.category} ·{' '}
                        {new Date(t.last_message_at).toLocaleDateString('tr-TR')}
                      </p>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
