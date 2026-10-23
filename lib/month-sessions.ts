// Ders & Görüşmeler — AYLIK GÖRÜNÜM (M1.0-05).
//
// Varsayılan görünüm artık haftadan AYA taşındı: ay içindeki haftalar
// satır, hizmet türü (Birebir Ders / Grup Dersi / Koçluk) sütun olur.
// Bu modül o ızgarayı SAF olarak kurar — DB/React'tan bağımsız, aynı
// gruplama mantığı iki yerde (öğrenci sayfası, ileride koç geneli)
// ayrı ayrı yazılmasın diye.
//
// AYNI HAFTA AYNI HİZMETTEN 2 OTURUM: aynı hücrede "1), 2)" alt alta —
// tek oturum varsa numara basılmaz (gereksiz gürültü).

import { isoWeekKey, monthWeeks, weekDateRangeLabel } from '@/lib/iso-week'

export type MonthColumnKind = 'birebir_ders' | 'grup_dersi' | 'kocluk'

const COLUMN_ORDER: MonthColumnKind[] = ['birebir_ders', 'grup_dersi', 'kocluk']

export const MONTH_COLUMN_LABEL: Record<MonthColumnKind, string> = {
  birebir_ders: 'Birebir Ders',
  grup_dersi: 'Grup Dersi',
  kocluk: 'Koçluk',
}

export interface MonthSessionLike {
  id: string
  serviceId: string
  currentPlannedAt: string
  /** 'iptal' hücrede hiç görünmez — PDF'in "gelecek hafta" önizlemesiyle aynı kural. */
  status: string
}

export interface MonthServiceLike {
  contactKind: MonthColumnKind
}

export interface MonthCellItem {
  sessionId: string
  /** Hücrede birden fazla oturum varsa "1)"/"2)"; tek oturumda null. */
  ordinal: string | null
}

export interface MonthWeekRow {
  weekKey: string
  /** "Kasım 1. Hafta" — bu ayın kaçıncı haftası (takvim yılı hafta no DEĞİL). */
  ordinalLabel: string
  /** "2-8 Kas" */
  rangeLabel: string
  cells: Record<MonthColumnKind, MonthCellItem[]>
}

function emptyCells(): Record<MonthColumnKind, MonthCellItem[]> {
  return { birebir_ders: [], grup_dersi: [], kocluk: [] }
}

/**
 * Bu ayda en az bir aktif hizmeti olan sütunlar, sabit sırada
 * (Birebir Ders, Grup Dersi, Koçluk). PDF'in "tek sütun" (Örnek A) ve
 * "iki sütun" (Örnek B) örnekleri buradan çıkar — hizmeti olmayan
 * sütun hiç çizilmez.
 */
export function monthColumnsFor(services: MonthServiceLike[]): MonthColumnKind[] {
  const present = new Set(services.map(s => s.contactKind))
  return COLUMN_ORDER.filter(k => present.has(k))
}

/**
 * `monthKey` ('YYYY-MM') için hafta satırlarını kurar, her oturumu
 * kendi (hafta, sütun) hücresine yerleştirir.
 *
 * `monthLabelPrefix`: "Kasım" gibi — çağıran taraf `lib/finance-ledger`
 * `monthLabel`'den ay adını ayırıp geçer (burada yeniden ay-adı
 * biçimlendirme icat edilmiyor).
 */
export function buildMonthWeekRows(
  monthKey: string,
  monthLabelPrefix: string,
  sessions: MonthSessionLike[],
  serviceById: Map<string, MonthServiceLike>
): MonthWeekRow[] {
  const weeks = monthWeeks(monthKey)
  const rows: MonthWeekRow[] = weeks.map((weekKey, index) => ({
    weekKey,
    ordinalLabel: `${monthLabelPrefix} ${index + 1}. Hafta`,
    rangeLabel: weekDateRangeLabel(weekKey),
    cells: emptyCells(),
  }))
  const rowByWeek = new Map(rows.map(r => [r.weekKey, r]))

  // Hücre içi sıralama için önce (hafta, sütun) başına toplanır.
  const bucket = new Map<string, MonthSessionLike[]>()
  for (const s of sessions) {
    if (s.status === 'iptal') continue
    const column = serviceById.get(s.serviceId)?.contactKind
    if (!column) continue
    const weekKey = isoWeekKey(new Date(s.currentPlannedAt))
    if (!rowByWeek.has(weekKey)) continue // ay dışına taşan sınır haftası
    const key = `${weekKey}:${column}`
    const list = bucket.get(key) ?? []
    list.push(s)
    bucket.set(key, list)
  }

  for (const [key, list] of bucket) {
    const [weekKey, column] = key.split(':') as [string, MonthColumnKind]
    const sorted = list.slice().sort((a, b) => a.currentPlannedAt.localeCompare(b.currentPlannedAt))
    const multi = sorted.length > 1
    rowByWeek.get(weekKey)!.cells[column] = sorted.map((s, i) => ({
      sessionId: s.id,
      ordinal: multi ? `${i + 1})` : null,
    }))
  }

  return rows
}
