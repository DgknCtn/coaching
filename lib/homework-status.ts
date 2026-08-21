// Ödev/test durum sözlüğü: bir testin AKTİF durumunu türeten ve o duruma
// karşılık gelen Türkçe etiketi üreten TEK merkezî yer.
//
// Kural: Durum türetmesini ve etiket metnini üreten TEK yer burasıdır.
// Başka hiçbir dosya kendi durum sıralamasını veya etiket string'ini
// yazmamalı — hepsi buradaki `deriveTestState` ve etiket haritalarını
// kullanmalı. (lib/plan-pace.ts ile aynı kalıp.)
//
// Neden: Kitap Haritası, öğrenci mobil ekranı, Görevler ve Dashboard aynı
// test için aynı aktif durumu göstermek zorunda. Etiketler beş ayrı dosyada
// elle yazıldığı sürece bu tutarlılık sağlanamaz.

/**
 * Bir testin tek aktif durumu. Aynı test aynı anda iki aktif durum taşımaz;
 * öncelik sırası `deriveTestState` içinde tanımlıdır.
 */
export type HomeworkTestState =
  | 'completed'
  | 'pending_approval'
  | 'overdue'
  | 'returned'
  | 'assigned'
  | 'not_assigned'
  | 'no_test'

export interface DeriveTestStateInput {
  /** Aktif bir test_completions kaydı var mı (öğretmen onaylı ilerleme). */
  hasActiveCompletion?: boolean
  /** İlgili homework_items.status — açık bir ödev kaydı yoksa null. */
  itemStatus?: 'pending' | 'pending_approval' | 'completed' | 'cancelled' | null
  /** Ait olduğu homework_batches.due_date (YYYY-MM-DD) — yoksa null. */
  dueDate?: string | null
  /** homework_items.rejected_at — öğretmen iade ettiyse dolu. */
  rejectedAt?: string | null
  /** O bölümde bu test numarası yoksa true (harita matrisindeki boş hücre). */
  isMissingTest?: boolean
  /** Test edilebilirlik için enjekte edilebilir. */
  today?: Date
}

function toDateString(d: Date): string {
  // Yerel takvim günü. UTC'ye çevirmek, akşam saatlerinde teslim tarihini
  // bir gün ileri kaydırıp gecikmeyi erken tetikleyebilirdi.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Tek aktif durumu türetir.
 *
 * Öncelik sırası (R3 v2 "Aktif durum önceliği" kuralı):
 *   completed > pending_approval > overdue > returned > assigned > not_assigned
 *
 * Kritik nokta: `pending_approval`, `overdue`'nun ÖNÜNDE gelir. Süresi geçmiş
 * bir testi öğrenci onaya gönderdiğinde aktif durum artık "Süresi Geçen"
 * değil "Onay Bekliyor"dur; geçmişte geciktiği bilgisi ayrı bir tarihçe
 * verisidir, aktif durum değil.
 */
export function deriveTestState(input: DeriveTestStateInput): HomeworkTestState {
  const { hasActiveCompletion, itemStatus, dueDate, rejectedAt, isMissingTest } = input

  if (isMissingTest) return 'no_test'
  if (hasActiveCompletion || itemStatus === 'completed') return 'completed'
  if (itemStatus === 'pending_approval') return 'pending_approval'

  // Buradan sonrası yalnızca açık (pending) bir ödev kaydı için anlamlı.
  if (itemStatus !== 'pending') return 'not_assigned'

  const todayStr = toDateString(input.today ?? new Date())
  if (dueDate && dueDate < todayStr) return 'overdue'
  if (rejectedAt) return 'returned'
  return 'assigned'
}

/** Etiketler role göre değişir: öğretmen "Reddedildi" der, öğrenci "İade Edildi" görür. */
export type StatusAudience = 'teacher' | 'student'

const TEACHER_LABEL: Record<HomeworkTestState, string> = {
  completed: 'Tamamlandı',
  pending_approval: 'Onay Bekliyor',
  overdue: 'Süresi Geçen',
  returned: 'Reddedildi',
  assigned: 'Ödevde',
  not_assigned: 'Henüz verilmedi',
  no_test: 'Test yok',
}

const STUDENT_LABEL: Record<HomeworkTestState, string> = {
  ...TEACHER_LABEL,
  returned: 'İade Edildi',
  assigned: 'Yapılacak',
}

export function testStateLabel(
  state: HomeworkTestState,
  audience: StatusAudience = 'teacher'
): string {
  return (audience === 'student' ? STUDENT_LABEL : TEACHER_LABEL)[state]
}

/** components/ui/badge.tsx variant adları. Renk tek başına anlam taşımaz;
 *  çağıran taraf ayrıca ikon/metin göstermelidir. */
export type TestStateVariant = 'success' | 'info' | 'destructive' | 'warning' | 'neutral'

export const TEST_STATE_VARIANT: Record<HomeworkTestState, TestStateVariant> = {
  completed: 'success',
  pending_approval: 'info',
  overdue: 'destructive',
  returned: 'warning',
  assigned: 'warning',
  not_assigned: 'neutral',
  no_test: 'neutral',
}

/**
 * Üst sayaç adları (R2 Ek Revizyon §1).
 *
 * "Süresi Geçen" ayrı bir toplam DEĞİLDİR: "Öğrenciden Beklenen"
 * çalışmaların içindeki teslim tarihi geçmiş kısmı gösterir. Bu yüzden
 * sayaç kartında OVERDUE_HINT ipucu ile birlikte gösterilmelidir —
 * aksi halde sayaçlar birbirini çelişkili biçimde topluyormuş gibi görünür.
 */
export const COUNTER_LABEL = {
  assigned: 'Öğrenciye Verilen',
  completed: 'Tamamlanan',
  pending: 'Öğrenciden Beklenen',
  pendingApproval: 'Onay Bekleyen',
  overdue: 'Süresi Geçen',
} as const

export const OVERDUE_HINT = 'Beklenenler içinde'
