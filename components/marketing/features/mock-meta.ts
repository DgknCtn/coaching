import type { MockKey } from '@/lib/features/catalog'

// Ekran etiketleri ve türü — bileşen içe aktarmayan SAF modül (testler
// ve sunucu/istemci sınırı için).

export const MOCK_LABEL: Record<MockKey, string> = {
  'student-list': 'Koç paneli: öğrenci durumu, gerekçesi ve ilerlemesi',
  homework: 'Ödev verme: Kitap Haritası, sayfa aralığıyla ödeve ekleme ve haftalık plan',
  approval: 'Öğretmen onayı: teslimleri onaylama ve ilerlemenin güncellenmesi',
  import: 'İçindekileri yapıştırma ve bölüm/test önizlemesi',
  'student-week': 'Öğrencinin telefondaki Haftam ekranı',
  parent: 'Veli paneli: onaylı çalışmalar, geciken iş ve kitap ilerlemesi',
  lessons: 'Ders & Görüşmeler: Google Takvim’den gelen dersler ve sonuçlar',
  ledger: 'Öğrenci cari hesabı: dersler, tahsilatlar ve bakiye',
  whatsapp: 'WhatsApp’a hazır ödev ve hatırlatma mesajları',
}

/** Telefon çerçeveli ekranlar masaüstü/mobil geçişi gerektirmez. */
export const PHONE_MOCKS: ReadonlySet<MockKey> = new Set(['student-week', 'parent', 'whatsapp'])
