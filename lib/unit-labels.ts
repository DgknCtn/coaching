// Takip birimi sözlüğü (R6-01): bir kitabın takip türünden ("test" mi "sayfa"
// mı) o kitaba ait BÜTÜN kullanıcı-görünür birim metinlerini üreten TEK yer.
//
// Kural: Birim kelimesini elle yazan başka bir dosya kalmamalı. Kitap Havuzu,
// kitap detayı, öğrenci kitabı, hedef/tempo, haftalık sepet, ödev kartı,
// Görevler ve veli paneli aynı fonksiyonlardan beslenir.
//
// Neden: Sayfa ile takip edilen MÖF/Parkur gibi kaynaklarda bazı ekranlar
// hâlâ "test", "test/hafta", "71 test seçildi" yazıyordu. Kitabın takip türü
// tek doğruluk kaynağıdır; etiket beş ayrı dosyada elle yazıldığı sürece bu
// tutarlılık sağlanamaz. (lib/homework-status.ts ile aynı kalıp.)
//
// DİKKAT: Bu modül yalnız ETİKET üretir, SAYI üretmez. Sayfa takipli kitapta
// her fiziksel sayfa ayrı bir book_tests satırıdır (022), bu yüzden mevcut
// birim sayımı zaten doğru sayfa sayısını verir ve değiştirilmemelidir.

import type { TrackingMode } from '@/lib/book-taxonomy'

/** Kitabın takip türü bilinmiyorsa test kabul edilir — 013'teki DB default'u
 *  ile aynı davranış. */
export type UnitMode = TrackingMode | string | null | undefined

/**
 * Takip türü -> birim adı (R7-02 §6.5).
 *
 * R7'de üç tür eklendi. Yapı değişmedi: her birim yine bir `book_tests`
 * satırıdır (022), yalnız adı farklıdır. Bu yüzden burada bir Record yeterli;
 * sayım ve yüzde mantığına dokunulmaz.
 */
const UNIT_LABEL: Record<string, string> = {
  test: 'test',
  page: 'sayfa',
  section: 'bölüm',
  step: 'adım',
  trial: 'deneme',
}

/** Tekil birim adı: "test" | "sayfa" | "bölüm" | "adım" | "deneme". */
export function unitLabel(mode: UnitMode): string {
  return UNIT_LABEL[mode ?? ''] ?? 'test'
}

/** Çoğul birim adı. Türkçede bu bağlamda sayıdan sonra çoğul eki
 *  kullanılmaz ("71 sayfa", "71 test"), bu yüzden tekil ile aynıdır.
 *  Yine de ayrı bir fonksiyon olarak durur: çağıran taraf niyetini
 *  belirtsin ve ileride bir dil değişikliği tek yerden yapılabilsin. */
export function unitLabelPlural(mode: UnitMode): string {
  return unitLabel(mode)
}

/** Haftalık tempo birimi: "test/hafta" | "sayfa/hafta". */
export function perWeekLabel(mode: UnitMode): string {
  return `${unitLabel(mode)}/hafta`
}

/** "614 sayfa" / "176 test" */
export function formatUnitCount(count: number, mode: UnitMode): string {
  return `${count.toLocaleString('tr-TR')} ${unitLabel(mode)}`
}

/** "0/71 sayfa" — ödev kartındaki kompakt ilerleme. */
export function formatUnitProgress(
  completed: number,
  total: number,
  mode: UnitMode
): string {
  return `${completed.toLocaleString('tr-TR')}/${total.toLocaleString('tr-TR')} ${unitLabel(mode)}`
}

/** "40,9 sayfa/hafta" — tempo göstergeleri bir ondalık basamakla gösterilir
 *  (lib/plan-pace.ts:roundTempo). Değer yoksa em-dash. */
export function formatTempo(value: number | null, mode: UnitMode): string {
  if (value === null) return '—'
  return `${value.toLocaleString('tr-TR')} ${perWeekLabel(mode)}`
}
