import { Section } from '@/components/shared/section'
import { formatNet } from '@/lib/mistakes/net'
import { REASON_LABEL, type MistakeReason } from '@/lib/mistakes/reasons'

// VELİ — "Soru çözümü ve hata defteri" özeti. Kaynak yalnız
// parent_mistake_summary (161): toplu sayılar; fotoğraf ve not YOK.

export interface ParentNotebookSummary {
  questions_7d: number
  net_7d: number
  active_days_7d: number
  reviews_7d: number
  in_review: number
  learned: number
  top_reason: MistakeReason | null
}

export function ParentNotebookCard({ summary: s }: { summary: ParentNotebookSummary }) {
  const empty = !s.questions_7d && !s.reviews_7d && !s.in_review && !s.learned
  if (empty) return null
  return (
    <Section title="Soru çözümü ve hata defteri" description="Son 7 gün · öğrencinin kendi girdiği kayıtlar">
      <dl className="grid grid-cols-2 divide-x divide-y rounded-lg border bg-card text-center sm:grid-cols-4 sm:divide-y-0">
        <Cell k="Çözülen soru" v={String(s.questions_7d)} sub={`${s.active_days_7d} gün çalıştı`} />
        <Cell k="Toplam net" v={formatNet(Number(s.net_7d))} />
        <Cell k="Yapılan tekrar" v={String(s.reviews_7d)} />
        <Cell k="Öğrenilen hata" v={String(s.learned)} sub={`${s.in_review} hata tekrarda`} />
      </dl>
      {s.top_reason && REASON_LABEL[s.top_reason] && (
        <p className="mt-2 text-sm text-muted-foreground">
          En sık hata nedeni: <span className="font-medium text-foreground">{REASON_LABEL[s.top_reason]}</span>
        </p>
      )}
    </Section>
  )
}

function Cell({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="px-2 py-3">
      <dd className="text-lg font-semibold tabular-nums">{v}</dd>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}
