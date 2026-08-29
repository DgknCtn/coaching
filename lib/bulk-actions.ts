// Kaynak Haritası toplu işlem uygunluğu (R6-03 §10).
//
// Kural: "Bu seçime hangi işlem, kaç öğeye uygulanabilir?" sorusunu yanıtlayan
// TEK yer burasıdır. UI yalnız bu sonucu gösterir; kendi sayımını kurmaz.
//
// Neden: Tek bir seçim farklı statülerde öğeler içerebilir. Eğitmen 9 çalışma
// seçtiğinde bunların 2'si onay bekliyor olabilir. Arayüz "Onayla" düğmesinin
// 9'una değil 2'sine uygulanacağını AÇIKÇA söylemek zorunda — aksi halde
// eğitmen ne olacağını tahmin etmeye çalışır.
//
//   9 çalışma seçildi
//   • Tamamlandı Olarak İşle (9)
//   • Onayla (2)

import type { HomeworkTestState } from '@/lib/homework-status'

export type BulkAction = 'complete' | 'approve' | 'revert'

/**
 * "Tamamlandı Olarak İşle" — eğitmenin doğrudan akademik kayıt yetkisi.
 * Henüz tamamlanmamış her çalışmaya uygulanabilir. Onay bekleyen bir çalışma
 * da bu yolla tamamlanabilir; fark, kaydın kaynağının teacher_manual olması.
 */
function canComplete(state: HomeworkTestState): boolean {
  return state !== 'completed' && state !== 'no_test'
}

/**
 * "Onayla" — normal öğretmen onayı. YALNIZ öğrencinin gönderdiği çalışmalar.
 * Bu, "Tamamlandı Olarak İşle" ile aynı işlem değildir (dokümanın §4 notu).
 */
function canApprove(state: HomeworkTestState): boolean {
  return state === 'pending_approval'
}

/** "Tamamlanmayı Geri Al" — yalnız tamamlanmış kayıtlar için anlamlı. */
function canRevert(state: HomeworkTestState): boolean {
  return state === 'completed'
}

const PREDICATE: Record<BulkAction, (state: HomeworkTestState) => boolean> = {
  complete: canComplete,
  approve: canApprove,
  revert: canRevert,
}

export function isActionApplicable(action: BulkAction, state: HomeworkTestState): boolean {
  return PREDICATE[action](state)
}

export interface BulkActionCounts {
  /** Seçimdeki toplam öğe sayısı. */
  selected: number
  complete: number
  approve: number
  revert: number
}

/**
 * Seçili öğelerin durumlarından her işlemin uygulanabilir öğe sayısını üretir.
 *
 * Girdi bilinçli olarak yalnız durum listesidir: sayım için id'ye gerek yok ve
 * fonksiyon böylece saf kalır, test edilebilir olur.
 */
export function countApplicable(states: HomeworkTestState[]): BulkActionCounts {
  return {
    selected: states.length,
    complete: states.filter(canComplete).length,
    approve: states.filter(canApprove).length,
    revert: states.filter(canRevert).length,
  }
}

/**
 * Bir işleme gerçekten uygulanacak birim id'lerini süzer.
 *
 * Sunucuya seçimin tamamı değil yalnız uygun olanlar gönderilir; RPC'ler zaten
 * uygun olmayanı atlıyor ama gereksiz satır göndermemek hem ağı hem de
 * kullanıcıya raporlanan sayıyı dürüst tutar.
 */
export function filterApplicable<T extends { id: string; state: HomeworkTestState }>(
  action: BulkAction,
  units: T[]
): string[] {
  return units.filter(u => isActionApplicable(action, u.state)).map(u => u.id)
}

/** Onay diyaloğu metni (§9): "7 çalışmanın tamamlanma kaydı geri alınacak." */
export function revertConfirmMessage(count: number): string {
  return `${count} çalışmanın tamamlanma kaydı geri alınacak. Devam edilsin mi?`
}

// ============================================================
// Bölüm bazlı durum seçimi (R6-03 §5 ve §7)
//
// Hem test hem sayfa takipli kaynaklarda öğretmen bir bölümün içinden
// yalnız belirli durumdaki çalışmaları seçebilmelidir. Seçim HER ZAMAN
// kendi bölüm/fasikül bağlamındadır: "F1 sf.15" ile "F2 sf.15" birbirinden
// bağımsız satırlardır (022), bu yüzden global bir sayfa aralığı seçimi
// kavramı yoktur ve olmamalıdır.
// ============================================================

/** Bölüm satırındaki hızlı seçim seçenekleri. */
export type SectionSelectKind = 'all' | 'overdue' | 'pending_approval' | 'not_assigned' | 'completed'

/** `label` geniş yüzeyler için, `shortLabel` dar test haritası hücreleri için.
 *  İkisi de burada yazılıdır; UI kendi kısaltmasını türetmez. */
export const SECTION_SELECT_OPTIONS: {
  kind: SectionSelectKind
  label: string
  shortLabel: string
}[] = [
  { kind: 'all', label: 'Tümünü seç', shortLabel: 'Tümü' },
  { kind: 'overdue', label: 'Süresi Geçenleri Seç', shortLabel: 'Süresi geçen' },
  { kind: 'pending_approval', label: 'Onay Bekleyenleri Seç', shortLabel: 'Onay bekleyen' },
  { kind: 'not_assigned', label: 'Henüz Verilmeyenleri Seç', shortLabel: 'Verilmeyen' },
  { kind: 'completed', label: 'Tamamlananları Seç', shortLabel: 'Tamamlanan' },
]

/**
 * Bir bölümdeki birimlerden istenen duruma uyanların id'lerini döndürür.
 *
 * 'all' seçeneği bölümün TANIMLI birimlerini seçer; boş hücreler (no_test)
 * hiçbir zaman dahil edilmez. Başka bölümdeki aynı test/sayfa numarasına
 * dokunulmaz — çağıran zaten yalnız tek bölümün birimlerini verir.
 */
export function selectByState<T extends { id: string; state: HomeworkTestState }>(
  kind: SectionSelectKind,
  units: T[]
): string[] {
  const usable = units.filter(u => u.state !== 'no_test')
  if (kind === 'all') return usable.map(u => u.id)
  return usable.filter(u => u.state === kind).map(u => u.id)
}
