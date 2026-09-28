import { Section } from '@/components/shared/section'
import { SectionUnavailable } from '@/components/shared/section-unavailable'
import { StudentStatusBadge } from '@/components/shared/student-status-badge'
import { createClient } from '@/lib/supabase/server'
import { listResult, type QueryResult } from '@/lib/data-result'
import { statusFromOperationRow, type OperationStatusRow } from '@/lib/operation-status'
import { formatSessionLong, SESSION_STATUS_LABEL, type SessionStatus } from '@/lib/service-structure'
import { OUTCOME_LABEL, openDays, type InterventionRow } from '@/lib/interventions'
import type { StudentStatus } from '@/lib/student-status'
import { InterventionControls, type SessionChoice } from './intervention-controls'

// MÜDAHALE BÖLÜMÜ (B16).
//
// Müdahale listesini ve görüşmeleri kendisi çeker. Durum ve gerekçe
// panelle AYNI operasyon satırından gelir; o satırı sayfa zaten "Bu Hafta"
// için okuyor, bu yüzden buraya HATASIYLA birlikte veriliyor (B13 aşama 0:
// önceden aynı satır ikinci kez sorgulanıyordu). Satır ya da liste
// alınamazsa bölüm "alınamadı" der, boş durum değil.

export async function InterventionSection({
  studentId,
  workspaceId,
  operationRow: row,
}: {
  studentId: string
  workspaceId: string
  /** Sayfanın okuduğu operasyon satırı (`select('*')`), hatasıyla. */
  operationRow: QueryResult<OperationStatusRow | null>
}) {
  const supabase = await createClient()
  const now = new Date()
  const from = new Date(now.getTime() - 30 * 86_400_000).toISOString()
  const to = new Date(now.getTime() + 14 * 86_400_000).toISOString()

  const [listRes, sessionsRes] = await Promise.all([
    supabase
      .from('interventions')
      .select(
        'id, status, opened_status, opened_signals, note, session_id, opened_at, outcome, close_note, closed_at'
      )
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .order('opened_at', { ascending: false })
      .limit(20),
    supabase
      .from('service_sessions')
      .select('id, planned_at, actual_at, status')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .neq('status', 'iptal')
      .gte('planned_at', from)
      .lte('planned_at', to)
      .order('planned_at', { ascending: false })
      .limit(30),
  ])

  const list = listResult(listRes, 'intervention.list')
  const sessions = listResult(sessionsRes, 'intervention.sessions')

  if (!row.ok || !list.ok) {
    return (
      <Section title="Müdahale" variant="card">
        <div className="p-4">
          <SectionUnavailable
            title="Müdahale kaydı şu an alınamadı"
            retryHref={`/teacher/students/${studentId}`}
          />
        </div>
      </Section>
    )
  }

  const current = row.data
    ? statusFromOperationRow(row.data, now)
    : { status: 'yolunda' as StudentStatus, signals: [] as string[] }
  const all = list.data as InterventionRow[]
  const open = all.find((i) => i.status === 'open') ?? null
  const history = all.filter((i) => i.status === 'closed')

  const sessionChoices: SessionChoice[] = (sessions.ok ? sessions.data : []).map((s) => ({
    id: s.id as string,
    label: `${formatSessionLong((s.actual_at ?? s.planned_at) as string)} · ${
      SESSION_STATUS_LABEL[s.status as SessionStatus] ?? s.status
    }`,
  }))
  const sessionLabel = (id: string | null) =>
    id ? (sessionChoices.find((c) => c.id === id)?.label ?? 'Bağlı görüşme') : null

  return (
    <Section
      title="Müdahale"
      description="Dikkat isteyen öğrenci için ne yapıldığı ve sonucu. Yalnız öğretmen görür."
      variant="card"
    >
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Şu anki durum:</span>
          <StudentStatusBadge status={current.status} />
          {current.signals.length > 0 && (
            <span className="text-muted-foreground">{current.signals.join(' · ')}</span>
          )}
        </div>

        {open ? (
          <div className="rounded-md border border-warning-border bg-warning-subtle/40 p-3">
            <p className="text-sm font-medium">
              Açık müdahale · {openDays(open.opened_at, now)} gündür
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Başlarken: {open.opened_signals.join(' · ') || 'gerekçe yok'}
            </p>
            {sessionLabel(open.session_id) && (
              <p className="mt-1 text-xs">Görüşme: {sessionLabel(open.session_id)}</p>
            )}
            {open.note && <p className="mt-2 whitespace-pre-line text-sm">{open.note}</p>}
          </div>
        ) : null}

        <InterventionControls
          studentId={studentId}
          open={
            open
              ? { id: open.id, note: open.note ?? '', sessionId: open.session_id }
              : null
          }
          currentStatus={current.status}
          sessions={sessionChoices}
        />

        {history.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Geçmiş</p>
            <ul className="divide-y text-sm">
              {history.map((h) => (
                <li key={h.id} className="py-2">
                  <p>
                    <span className="font-medium">{OUTCOME_LABEL[h.outcome!]}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      · {formatSessionLong(h.opened_at)} → {formatSessionLong(h.closed_at)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Başlarken: {h.opened_signals.join(' · ') || '—'}
                  </p>
                  {h.close_note && <p className="mt-1 text-xs">{h.close_note}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  )
}
