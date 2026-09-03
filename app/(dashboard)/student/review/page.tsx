import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { getStudentContext } from '@/lib/workspace'
import { loadProtectionPoolData } from '@/lib/protection-pool-rows'
import {
  buildProtectionPool,
  contactAmountLabel,
  summarizePool,
  type PoolPriority,
} from '@/lib/protection-pool'
import { todayDateString } from '@/lib/homework-status'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ExplainerCards, type ExplainerCard } from '@/components/shared/explainer-cards'
import { Legend } from '@/components/shared/legend'
import { LinkTabs } from '@/components/shared/link-tabs'
import { MetricRow } from '@/components/shared/metric-row'
import { cn } from '@/lib/utils'

// "Tekrar edilecek konular" — Koruma Havuzunun öğrenci sürümü.
//
// AYNI HESAP, FARKLI DİL. Satırlar öğretmenle aynı yerden kurulur
// (lib/protection-pool-rows.ts) ve aynı fonksiyondan geçer
// (buildProtectionPool); iki ekranın farklı liste göstermesi kabul
// edilemez. Değişen yalnız anlatım:
//
//   öğretmende            öğrencide
//   ----------            ---------
//   "radar" / "izleme"    "unutmamak için"
//   Öncelikli             Uzun süredir dokunmadın
//   Takipte               Yaklaşıyor
//   Normal                Yeni çalıştın
//
// Sıralama bandı EŞİK DEĞİLDİR ve öğrencide de değildir: hiçbir şeyi
// tetiklemez, yalnız uzun aralığı görünür kılar. Öğrenciye "bunu yapmak
// zorundasın" demez — ödev vermek eğitmenin işidir.
//
// EYLEM YOK: öğrenci temas yazamaz, "Aktif Tut" işaretleyemez. RLS de
// yalnız SELECT veriyor (046). Tek eylem, konunun çalışıldığı kitabın
// haritasına gitmek.

export const dynamic = 'force-dynamic'

/** Öğrenci diline çevrilmiş bant etiketleri. */
const PRIORITY_LABEL: Record<PoolPriority, string> = {
  priority: 'Uzun süredir dokunmadın',
  watch: 'Yaklaşıyor',
  normal: 'Yeni çalıştın',
}

const PRIORITY_STYLE: Record<PoolPriority, string> = {
  priority: 'bg-destructive-subtle text-destructive-foreground border-destructive-border',
  watch: 'bg-warning-subtle text-warning-foreground border-warning-border',
  normal: 'bg-muted text-muted-foreground border-border',
}

const LEGEND_ENTRIES: { label: string; className: string }[] = [
  { label: `${PRIORITY_LABEL.priority} (30+ gün)`, className: 'bg-destructive-border' },
  { label: `${PRIORITY_LABEL.watch} (14-29 gün)`, className: 'bg-warning-border' },
  { label: `${PRIORITY_LABEL.normal} (0-13 gün)`, className: 'bg-muted-foreground/40' },
]

const EXPLAINERS: ExplainerCard[] = [
  {
    title: 'Bu liste ne işe yarar?',
    description: 'Zorunlu bir tekrar programı değil; unutmamak için bir hatırlatıcı.',
    items: [
      { text: 'Daha önce gerçekten çalıştığın ama bir süredir dokunmadığın konuları gösterir.' },
      { text: 'Hiç çalışmadığın konular burada görünmez — bu liste ödev listesi değildir.' },
      { text: 'Üzerinde açık çalışman olan konu listede yer almaz; zaten onunla meşgulsün.' },
    ],
  },
  {
    title: 'Gün sayısı neye göre?',
    items: [
      { text: 'Tamamladığın ve öğretmeninin onayladığı test/sayfa çalışması sayılır.', tone: 'positive' },
      { text: 'Konuya bağlı gerçekleşmiş ders sayılır.', tone: 'positive' },
      { text: 'Sana ödev verilmesi tek başına sayılmaz — çözmen gerekir.', tone: 'negative' },
      { text: 'Gün sayısı arttıkça konu listenin üstüne çıkar.' },
    ],
  },
  {
    title: 'Ne yapmalıyım?',
    items: [
      { text: 'Karar senin ve öğretmeninin: liste bir şey zorunlu kılmaz.' },
      { text: 'Bir konuya dönmek istersen satırdaki kaynağa tıklayıp o kitabın haritasına gidebilirsin.' },
      { text: 'Yeni bir çalışma tamamlandığında konu listenin altına iner.' },
    ],
  },
]

export default async function StudentReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>
}) {
  const { scope: rawScope } = await searchParams
  const { supabase, student, workspaceId } = await getStudentContext()

  const { scopes, activeScopeId, rows, bookIdsByTopic } = await loadProtectionPoolData(
    supabase,
    { workspaceId, studentId: student.id, requestedScopeId: rawScope }
  )

  const today = todayDateString()
  const pool = buildProtectionPool(rows, today)
  const summary = summarizePool(rows, pool)

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Tekrar"
        subtitle="Daha önce çalıştığın ama bir süredir dönmediğin konular. Unutmamak için."
      />

      {scopes.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={ShieldCheck}
            title="Henüz izlenen ders yok"
            description="Öğretmenin senin için bir konu planı kurduğunda bu liste çalışmaya başlar."
          />
        </div>
      ) : (
        <>
          {scopes.length > 1 && (
            <LinkTabs
              tabs={scopes.map(s => ({
                key: s.id,
                label: s.name,
                href: `/student/review?scope=${s.id}`,
              }))}
              activeKey={activeScopeId ?? ''}
            />
          )}

          <MetricRow
            className="md:grid-cols-3"
            metrics={[
              { label: 'Listedeki konu', value: summary.inPool },
              { label: '30 günden fazla', value: summary.overThirtyDays },
              {
                label: 'En uzun ara',
                value: summary.longestDays === null ? '—' : `${summary.longestDays} gün`,
                hint: summary.longestTopicName ?? undefined,
              },
            ]}
          />

          {pool.length === 0 ? (
            <div className="rounded-lg border bg-card">
              <EmptyState
                icon={ShieldCheck}
                title="Şu an tekrar bekleyen konu yok"
                description="Ya bu derste henüz onaylanmış çalışman yok ya da bütün konularda açık çalışman var. İkisi de sorun değil."
              />
            </div>
          ) : (
            <div className="space-y-3">
              <Legend entries={LEGEND_ENTRIES} />

              <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                {pool.map(row => {
                  const bookId = bookIdsByTopic.get(row.topicId)?.[0] ?? null
                  const amount = contactAmountLabel(row)
                  return (
                    <li key={row.topicId} className="px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{row.topicName}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Son çalışman{' '}
                            <span className="tabular-nums">{row.daysSinceContact}</span> gün
                            önce
                            {amount && <span> · {amount}</span>}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 rounded-md border px-1.5 py-0.5 text-[11px]',
                            PRIORITY_STYLE[row.priority]
                          )}
                        >
                          {PRIORITY_LABEL[row.priority]}
                        </span>
                      </div>

                      {/* Tekrar etmek isteyene gideceği yeri göster; kitap
                          eşleşmesi yoksa satır yine de anlamlı kalır. */}
                      {bookId && row.bookTitles.length > 0 && (
                        <Link
                          href={`/student/books/${bookId}`}
                          className="mt-1.5 inline-block text-xs text-primary hover:underline"
                        >
                          {row.bookTitles[0]} haritasına git
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}

      <ExplainerCards cards={EXPLAINERS} />
    </div>
  )
}
