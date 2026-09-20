import type { SupabaseClient } from '@supabase/supabase-js'

// "Bu kaynaktan bu hafta çalışma verildi mi, açık ödev kaldı mı?" —
// TEK yanıt yeri (R7 Kaynak Mimarisi §5.3, §6.3).
//
// lib/open-work.ts'in konu bazlı eşdeğeri; orası "bu KONUDA açık iş var
// mı?" sorusunu yanıtlıyor, burası aynı soruyu KAYNAK (öğrenci-kitap
// ataması) ölçeğinde yanıtlıyor. İkisi farklı ekranların ihtiyacı ve
// farklı gruplama anahtarları kullandığı için ayrı durur.
//
// TON KURALI (§6.3) — bu modülü okuyan her ekran için bağlayıcı:
// 0 çalışma verilmiş olması "eksik", "ceza" veya "tamamlanmadı"
// ANLAMINA GELMEZ. Öğretmen planlanan haftalık miktarın altında bilinçli
// ödev verebilir; sistem "8 eksik verdin" uyarısı üretmez. Sayı nötr
// gösterilir.
//
// AÇIK ÖDEV HAFTAYA BAĞLI DEĞİLDİR: geçmiş haftadan kalan açık çalışma
// olabilir ve bu haftanın kotasından otomatik düşülmez. Bu yüzden iki
// sayı ayrı alanlardır, biri diğerinden türetilmez.

export interface ResourceWeekSignal {
  /** Bu haftanın teslim tarihli ödev kalemleri. */
  assignedThisWeek: number
  /** Henüz kapanmamış kalemler — tüm haftalar. */
  openItems: number
}

const EMPTY: ResourceWeekSignal = { assignedThisWeek: 0, openItems: 0 }

/** Hiç ödev almamış kaynak haritada bulunmaz; çağıran bu değeri kullanır. */
export function emptyResourceWeekSignal(): ResourceWeekSignal {
  return EMPTY
}

/**
 * Atama id'si -> haftalık sinyal.
 *
 * Kaynak `student_resource_week_signal_view` (098). Hafta sınırı
 * görünümde `DATE_TRUNC('week', CURRENT_DATE)` ile pazartesi başlangıçlı
 * hesaplanır — 004'teki haftalık ödev özeti görünümüyle aynı kalıp.
 * Sınırı burada TS tarafında ikinci kez hesaplamak, iki ekranın farklı
 * hafta görmesine yol açardı.
 */
export async function loadResourceWeekSignals(
  supabase: SupabaseClient,
  { workspaceId, studentId }: { workspaceId: string; studentId: string }
): Promise<Map<string, ResourceWeekSignal>> {
  const { data } = await supabase
    .from('student_resource_week_signal_view')
    .select('assignment_id, assigned_this_week, open_items')
    .eq('workspace_id', workspaceId)
    .eq('student_id', studentId)

  const rows = (data ?? []) as {
    assignment_id: string
    assigned_this_week: number | string
    open_items: number | string
  }[]

  return new Map(
    rows.map(r => [
      r.assignment_id,
      {
        assignedThisWeek: Number(r.assigned_this_week ?? 0),
        openItems: Number(r.open_items ?? 0),
      },
    ])
  )
}
