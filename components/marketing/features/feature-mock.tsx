import type { MockKey } from '@/lib/features/catalog'
export { MOCK_LABEL, PHONE_MOCKS } from './mock-meta'
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
