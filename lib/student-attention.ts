/**
 * Revizyon 01 §3 — "Durum etiketi için kural":
 * "İyi / Kötü / Riskli öğrenci" gibi genel hükümlerden kaçınılır.
 * Dashboard öğrenciyi etiketlemez, SOMUT durumu gösterir.
 *
 * Bu dosya o ifadenin TEK kaynağıdır; hem dashboard tablosu hem
 * /teacher/tasks aynı cümleyi üretsin diye (plan-pace.ts'teki
 * "tek yerde cümle kur" deseninin aynısı).
 */

export interface StudentAttentionInput {
  /** 24 saati geçmiş, cevaplanmamış durum bildiriminin due_at'i. */
  pending_check_in_since?: string | null
  /** Öğretmen onayı bekleyen görev sayısı. */
  pending_approval?: number | null
  /** Son teslim tarihi geçmiş, tamamlanmamış görev sayısı. */
  overdue?: number | null
}

export type AttentionTone = 'attention' | 'warning' | 'none'

export interface StudentAttention {
  label: string
  tone: AttentionTone
}

/**
 * Öncelik sırası bilinçli: en uzun süredir sessiz kalan durum (temas
 * kaybı) her şeyin önünde gelir, sonra geciken iş, sonra onay kuyruğu.
 * Onay bekleyen öğretmenin kendi kuyruğudur — öğrencide bir sorun
 * olduğu anlamına gelmez, o yüzden en sonda ve daha yumuşak tonda.
 */
export function describeStudentAttention(input: StudentAttentionInput): StudentAttention {
  const overdue = Number(input.overdue ?? 0)
  const pendingApproval = Number(input.pending_approval ?? 0)

  if (input.pending_check_in_since) {
    const hours = Math.floor(
      (Date.now() - new Date(input.pending_check_in_since).getTime()) / 3_600_000
    )
    const days = Math.floor(hours / 24)
    return {
      label: days >= 2 ? `${days} gündür bildirim yok` : '24 saattir bildirim yok',
      tone: 'attention',
    }
  }

  if (overdue > 0) {
    return { label: `${overdue} geciken çalışma`, tone: 'attention' }
  }

  if (pendingApproval > 0) {
    return { label: `${pendingApproval} onay bekliyor`, tone: 'warning' }
  }

  return { label: 'İşlem yok', tone: 'none' }
}

/**
 * "Son durum / temas" sütunu için göreli zaman. Uygulamaya giriş
 * zamanını değil, öğrencinin gönderdiği son planlı bildirimi anlatır.
 */
export function formatRelativeTime(value: string | null | undefined, now = Date.now()): string {
  if (!value) return 'Hiç'

  const minutes = Math.floor((now - new Date(value).getTime()) / 60_000)
  if (minutes < 1) return 'Az önce'
  if (minutes < 60) return `${minutes} dk önce`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} saat önce`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} gün önce`

  return new Date(value).toLocaleDateString('tr-TR')
}

const MOOD_LABELS: Record<string, string> = {
  iyi: 'İyi gidiyor',
  idare_eder: 'İdare eder',
  zorlaniyorum: 'Zorlanıyorum',
}

export function moodLabel(mood: string | null | undefined): string {
  return mood ? (MOOD_LABELS[mood] ?? mood) : '—'
}
