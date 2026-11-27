import { words } from './homework-defaults'

// KONU EŞLEME YARDIMI (Kitap Girişi ve Konu Eşleme · 2a, 2b).
//
// 2a — KAPSAM KADEMESİ: kitabın dersine göre kapsamlar üç kademeye
// ayrılır; seçicide ilgili kapsamlar üstte ve açık, diğerleri kapalı.
// Kapsamın ders/seviye ALANLARI şablondan açılan kayıtlarda çoğu zaman
// boş; bilgi adda durur ("10. Sınıf Matematik"). Bu yüzden alan boşsa ad
// sözcüklerine bakılır (suggestScopeForBook ile aynı ders).
//
// 2b — KONU ÖNERİSİ: bölüm adının sözcükleri konu adlarıyla
// karşılaştırılır, en yakın 1–3 konu ÖNERİLİR. Otomatik eşleme YOK:
// öğretmen tek tıkla onaylar. Eşik altı sonuç gösterilmez — boş öneri,
// yanlış öneriden iyidir.

export type ScopeTier = 'primary' | 'related' | 'other'

export const TIER_ORDER: Record<ScopeTier, number> = { primary: 0, related: 1, other: 2 }

export interface ScopeMeta {
  id: string
  name: string
  subject: string | null
  levelExam: string | null
}

export interface BookMeta {
  subject: string | null
  levelExam: string | null
}

/**
 * Ders aileleri: ilk sözcük dersin kendisi, kalanlar "ilgili" sayılan
 * yakın dersler. Matematik kitabında geometri kapsamları da ilgilidir
 * (trigonometri, analitik geometri), tersi de öyle.
 */
const SUBJECT_FAMILY: Record<string, string[]> = {
  matematik: ['matematik', 'geometri'],
  geometri: ['geometri', 'matematik'],
  turkce: ['turkce', 'edebiyat'],
  edebiyat: ['edebiyat', 'turkce'],
  fizik: ['fizik'],
  kimya: ['kimya'],
  biyoloji: ['biyoloji'],
  fen: ['fen', 'fizik', 'kimya', 'biyoloji'],
  tarih: ['tarih', 'inkilap'],
  inkilap: ['inkilap', 'tarih'],
  cografya: ['cografya'],
  felsefe: ['felsefe', 'psikoloji', 'sosyoloji', 'mantik'],
  din: ['din'],
  ingilizce: ['ingilizce'],
}

function subjectFamily(subject: string | null): string[] {
  const w = words(subject)
  for (const token of w) if (SUBJECT_FAMILY[token]) return SUBJECT_FAMILY[token]
  return w.filter(t => t.length > 2).slice(0, 1)
}

export function scopeTier(scope: ScopeMeta, book: BookMeta): ScopeTier {
  const family = subjectFamily(book.subject)
  if (family.length === 0) return 'other'
  const scopeWords = new Set([...words(scope.subject), ...words(scope.name)])
  const main = scopeWords.has(family[0])
  const related = family.slice(1).some(f => scopeWords.has(f))
  if (!main && !related) return 'other'

  const level = words(book.levelExam)
  if (level.length === 0) return main ? 'primary' : 'related'
  const scopeLevel = new Set([...words(scope.levelExam), ...words(scope.name)])
  const levelMatch = level.every(l => scopeLevel.has(l))
  return main && levelMatch ? 'primary' : 'related'
}

// ------------------------------------------------------------
// 2b — bölüm adından konu önerisi
// ------------------------------------------------------------

/** Anlam taşımayan sözcükler (bağlaç, kitap yapısı sözcükleri). */
const STOPWORDS = new Set([
  've', 'ile', 'ya', 'da', 'de', 'veya', 'icin', 'bir',
  'bolum', 'bolumu', 'unite', 'unitesi', 'test', 'testi', 'testler', 'testleri',
  'konu', 'konusu', 'konulari', 'tekrar', 'karma', 'genel', 'deneme', 'denemesi',
  'soru', 'sorular', 'sorulari', 'kazanim', 'kazanimlari', 'ozet', 'giris',
  'i', 'ii', 'iii', 'iv', 'v', 'vi',
])

/** Aynı kavramın yaygın iki yazımı tek biçime indirgenir. */
const SYNONYM: Record<string, string> = { obeb: 'ebob', okek: 'ekok', istatiksel: 'istatistiksel' }

/**
 * Anlamlı sözcükler. Kitap bölüm adları kod ve kısaltma taşır
 * ("T4 |B7· Nicelikler ve D. (Karesel Fonksiyon)", "Ge.Şek."): rakam
 * içeren parçalar ve 3 harften kısa parçalar sayılmaz — yoksa eşleşme
 * oranı yapay olarak düşer (28.11 canlı kabul: Parkur 10).
 */
export function contentWords(s: string | null | undefined): string[] {
  return [
    ...new Set(
      words(s)
        .filter(w => w.length >= 3 && !/\d/.test(w) && !STOPWORDS.has(w))
        .map(w => SYNONYM[w] ?? w)
    ),
  ]
}

/**
 * Sözcük eşleşmesi: kısa sözcükler (≤4) birebir; uzunlarda ilk 5 harf
 * (Türkçe ekler: "trigonometri" ~ "trigonometrik", "türev" ~ "türevin").
 */
export function sameStem(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 5 || b.length < 5) return false
  return a.slice(0, 5) === b.slice(0, 5)
}

const TIER_BONUS: Record<ScopeTier, number> = { primary: 0.1, related: 0.05, other: -0.15 }
export const SUGGEST_THRESHOLD = 0.5

export interface SuggestCandidate {
  id: string
  name: string
  tier?: ScopeTier
}

export interface TopicSuggestion<T> {
  topic: T
  score: number
}

/**
 * En yakın `limit` konu. Skor = bölüm sözcüklerinin karşılanma oranı
 * (ağırlık 0.7) + konu sözcüklerinin karşılanma oranı (0.3) + kademe.
 * Bölüm sözcüklerinin en az yarısı karşılanmalı ya da konu adı bölüm
 * adında tamamen geçmeli; "diğer" kademede kural daha sıkı.
 */
export function suggestTopics<T extends SuggestCandidate>(
  sectionTitle: string,
  topics: T[],
  limit = 3
): TopicSuggestion<T>[] {
  const title = contentWords(sectionTitle)
  if (title.length === 0) return []
  const scored: TopicSuggestion<T>[] = []
  topics.forEach(topic => {
    const tw = contentWords(topic.name)
    if (tw.length === 0) return
    const covered = title.filter(w => tw.some(t => sameStem(w, t))).length
    if (covered === 0) return
    const titleCover = covered / title.length
    const topicCover = tw.filter(t => title.some(w => sameStem(w, t))).length / tw.length
    const tier = topic.tier ?? 'related'
    // İki yoldan biri yeter: bölüm adının en az yarısı karşılanıyor YA DA
    // konu adının TAMAMI bölüm adında geçiyor ("Türev Alma Kuralları" →
    // "Türev"; bölüm adları konu adlarından çoğu zaman uzundur).
    const topicFull = topicCover === 1
    if (titleCover < 0.5 && !topicFull) return
    // Diğer (ilgisiz) kapsamda daha sıkı: bölüm adı tamamen karşılanmalı
    // ya da en az iki sözcüklü konu adı tamamen geçmeli.
    if (tier === 'other' && titleCover < 1 && !(topicFull && tw.length >= 2)) return
    const score = Math.round((titleCover * 0.7 + topicCover * 0.3 + TIER_BONUS[tier]) * 1000) / 1000
    if (score >= SUGGEST_THRESHOLD) scored.push({ topic, score })
  })
  // Kararlı sıralama: eşit skorda giriş sırası (kademe/kapsam/konu sırası) korunur.
  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}

// ------------------------------------------------------------
// 2c — toplu eşleme satırları
// ------------------------------------------------------------

export interface BulkSectionInput {
  id: string
  title: string
  orderIndex: number
  parentId: string | null
  topicIds: string[]
}

export interface BulkRow<T> {
  id: string
  title: string
  /** Alt bölümse üst bölümün adı. */
  parentTitle: string | null
  /** Mevcut (kayıtlı) eşleme. */
  topicIds: string[]
  suggestions: T[]
  /** Ön işaretli öneri: YALNIZ eşlenmemiş bölümde ve eşik üstü öneride. */
  preselect: string | null
}

/**
 * Eşlenecek satırlar: YAPRAK bölümler, kitap sırasıyla. Alt bölümü olan
 * bölüm bir kapsayıcıdır — testler alt bölümdedir (book_tests.section_id
 * yaprağı gösterir, 047), eşleme de orada işe yarar. Eşlenmiş bölümün
 * eşlemesine dokunulmaz; öneri yalnız gösterilir.
 */
export function buildBulkRows<T extends SuggestCandidate>(sections: BulkSectionInput[], topics: T[]): BulkRow<T>[] {
  const byParent = new Map<string, BulkSectionInput[]>()
  for (const s of sections) {
    if (!s.parentId) continue
    byParent.set(s.parentId, [...(byParent.get(s.parentId) ?? []), s])
  }
  const tops = sections.filter(s => !s.parentId).sort((a, b) => a.orderIndex - b.orderIndex)
  const leaves: { s: BulkSectionInput; parentTitle: string | null }[] = []
  for (const top of tops) {
    const kids = (byParent.get(top.id) ?? []).sort((a, b) => a.orderIndex - b.orderIndex)
    if (kids.length === 0) leaves.push({ s: top, parentTitle: null })
    else for (const k of kids) leaves.push({ s: k, parentTitle: top.title })
  }
  return leaves.map(({ s, parentTitle }) => {
    const suggestions = suggestTopics(s.title, topics.filter(t => !s.topicIds.includes(t.id))).map(x => x.topic)
    return {
      id: s.id,
      title: s.title,
      parentTitle,
      topicIds: s.topicIds,
      suggestions,
      preselect: s.topicIds.length === 0 ? suggestions[0]?.id ?? null : null,
    }
  })
}
