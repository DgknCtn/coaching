// Destek talebi etiketleri — TEK KAYNAK.
//
// ============================================================
// NEDEN BURADA
//
// Durum ve kategori haritaları ÜÇ ayrı dosyada kopyalanmıştı:
// öğretmen listesi, talep detayı ve yönetim paneli. Kopyalar çoktan
// ayrışmıştı da — form "Teknik sorun" derken liste aynı kaydı
// "Teknik" gösteriyordu. Kategori sayısı dörtten dokuza çıkarken bu
// tekrarı üçe katlamanın anlamı yoktu.
//
// Değerler `support_tickets` tablosundaki CHECK kısıtlarına bağlı
// (062). Buraya yeni bir kategori eklemek tek başına yetmez; migration
// da güncellenmeli, yoksa talep açılırken veritabanı reddeder.
// ============================================================

/** Talep durumu — `support_tickets.status` CHECK'i (060). */
export type TicketStatus = 'open' | 'answered' | 'closed'

/** Talep kategorisi — `support_tickets.category` CHECK'i (062). */
export type TicketCategory =
  | 'genel'
  | 'hesap'
  | 'ogrenci'
  | 'odev'
  | 'kitap'
  | 'rapor'
  | 'teknik'
  | 'odeme'
  | 'oneri'

/**
 * Durum etiketleri ve rozet tonu.
 *
 * Öğretmen ile yönetici AYNI etiketi görüyor — bilinçli. Destek
 * ekibinin "yanıtlandı" dediği bir talebi öğretmenin başka bir adla
 * görmesi, iki tarafın aynı şeyden söz ettiğinden emin olmasını
 * zorlaştırırdı.
 */
export const TICKET_STATUS: Record<
  TicketStatus,
  { label: string; variant: 'info' | 'success' | 'neutral' }
> = {
  open: { label: 'Yanıt bekliyor', variant: 'info' },
  answered: { label: 'Yanıtlandı', variant: 'success' },
  closed: { label: 'Kapatıldı', variant: 'neutral' },
}

/**
 * Kategori etiketleri.
 *
 * Formda ve listede AYNI metin kullanılıyor. Önceden form "Ödeme ve
 * lisans", liste "Ödeme" diyordu; kullanıcı seçtiği şeyi listede
 * bulamıyordu.
 */
export const TICKET_CATEGORY: Record<TicketCategory, string> = {
  genel: 'Genel',
  hesap: 'Hesap ve giriş',
  ogrenci: 'Öğrenci işlemleri',
  odev: 'Ödev ve görevler',
  kitap: 'Kitaplar',
  rapor: 'Raporlar',
  teknik: 'Teknik sorun',
  odeme: 'Ödeme ve plan',
  oneri: 'Öneri',
}

/** Form seçeneklerinin sırası — sık kullanılan üstte, öneri en altta. */
export const TICKET_CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = (
  ['genel', 'hesap', 'ogrenci', 'odev', 'kitap', 'rapor', 'teknik', 'odeme', 'oneri'] as const
).map((value) => ({ value, label: TICKET_CATEGORY[value] }))

/** Bilinmeyen değerde ham veriyi basmak yerine anlaşılır bir karşılık döner. */
export function ticketStatusLabel(status: string): string {
  return TICKET_STATUS[status as TicketStatus]?.label ?? status
}

export function ticketStatusVariant(status: string): 'info' | 'success' | 'neutral' {
  return TICKET_STATUS[status as TicketStatus]?.variant ?? 'neutral'
}

export function ticketCategoryLabel(category: string): string {
  return TICKET_CATEGORY[category as TicketCategory] ?? category
}
