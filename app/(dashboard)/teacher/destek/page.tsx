import type { Metadata } from 'next'
import Link from 'next/link'
import { LifeBuoy } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { getTeacherContext } from '@/lib/workspace'
import { ticketCategoryLabel, ticketStatusLabel, ticketStatusVariant } from '@/lib/support'
import { formatDateTr } from '@/lib/format'
import { NewTicketForm } from './new-ticket-form'

export const metadata: Metadata = { title: 'Destek' }

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
    // SAYFA SARMALAYICISI (067): bu üç ekran bare <div> ile açılıyordu ve
    // diğer bütün öğretmen sayfalarından farklı olarak içeriği kenara
    // yapışık, genişliği sınırsız çiziyordu. Ölçüler teacher/students ve
    // teacher/finans ile aynı.
    <div className="max-w-4xl space-y-8 p-6 md:p-8">
      <PageHeader
        title="Size nasıl yardımcı olabiliriz?"
        subtitle="Bir sorunuz mu var veya bir sorunla mı karşılaştınız? Destek talebinizi oluşturun, ekibimiz buradan sizinle iletişime geçsin."
      />

      <div className="space-y-6">
        <NewTicketForm />

        <div>
          <h2 className="mb-3 text-base font-medium">Talepleriniz</h2>
          {rows.length === 0 ? (
            /* Ortalama yanıt süresi BİLİNÇLİ olarak yazılmıyor: ölçülmüyor.
               Ölçülmeyen bir söz vermek, destek ekranında verilebilecek en
               kötü sözdür. */
            <div className="rounded-lg border bg-card">
              <EmptyState
                icon={LifeBuoy}
                title="Henüz bir destek talebiniz yok"
                description="Sorularınız, karşılaştığınız sorunlar veya önerileriniz için bize buradan ulaşabilirsiniz."
              />
            </div>
          ) : (
            <div className="divide-y rounded-lg border bg-card">
              {rows.map((t) => {
                return (
                  <Link
                    key={t.id}
                    href={`/teacher/destek/${t.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.subject}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {ticketCategoryLabel(t.category)} ·{' '}
                        {formatDateTr(t.last_message_at)}
                      </p>
                    </div>
                    <Badge variant={ticketStatusVariant(t.status)}>
                      {ticketStatusLabel(t.status)}
                    </Badge>
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
