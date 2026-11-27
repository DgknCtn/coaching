import type { MockKey } from '@/lib/features/catalog'
import { StudentListMock } from '../mock/student-list-mock'
import { HomeworkMock } from '../mock/homework-mock'
import { ApprovalMock } from '../mock/approval-mock'
import { ImportMock } from '../mock/import-mock'
import { LessonsMock } from '../mock/lessons-mock'
import { LedgerMock } from '../mock/ledger-mock'
import { ParentMock } from '../mock/parent-mock'
import { WhatsappMock } from '../mock/whatsapp-mock'
import { PhonePreview } from '../phone-preview'

// Katalogdaki ekran anahtarı → uygulamanın gerçek bileşenleriyle çizilmiş
// ekran. Yeni bir ekran eklemek: MockKey + buraya bir satır.

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

export function FeatureMock({ mock }: { mock: MockKey }) {
  switch (mock) {
    case 'student-list':
      return <StudentListMock />
    case 'homework':
      return <HomeworkMock />
    case 'approval':
      return <ApprovalMock />
    case 'import':
      return <ImportMock />
    case 'student-week':
      return <PhonePreview />
    case 'parent':
      return <ParentMock />
    case 'lessons':
      return <LessonsMock />
    case 'ledger':
      return <LedgerMock />
    case 'whatsapp':
      return <WhatsappMock />
  }
}
