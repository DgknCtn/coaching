import { Copy, MessageCircle } from 'lucide-react'
import { buildLessonReminder, buildShareText } from '@/lib/share-text'
import { PhoneFrame } from '../phone-frame'

// WHATSAPP İŞ AKIŞI — balonlardaki metinler UYGULAMANIN GERÇEK mesaj
// üreticilerinden (lib/share-text.ts) örnek veriyle üretilir. Otomatik
// gönderim yok: öğretmen kopyalar ya da WhatsApp'ta açar.

function demoMessages(now: Date = new Date()) {
  const due = new Date(now.getTime() + 4 * 86_400_000)
  due.setHours(18, 0, 0, 0)
  const lesson = new Date(now.getTime() + 86_400_000)
  lesson.setHours(10, 0, 0, 0)
  const homework = buildShareText({
    studentName: 'Ayşe',
    dueAt: due,
    books: [
      {
        bookTitle: 'TYT Matematik Soru Bankası',
        trackingMode: 'test',
        unitCount: 3,
        sections: [{ title: 'Problemler', units: [5, 6, 7] }],
      },
      {
        bookTitle: 'Paragraf Soru Bankası',
        trackingMode: 'page',
        unitCount: 9,
        sections: [{ title: 'Ana Düşünce', units: [2, 3, 4, 5, 6, 7, 8, 9, 10] }],
      },
    ],
  })
  const reminder = buildLessonReminder({ studentName: 'Ayşe Y.', at: lesson, online: true, subject: 'Matematik', now })
  return { homework, reminder }
}

export function WhatsappMock() {
  const { homework, reminder } = demoMessages()
  return (
    <PhoneFrame label="WhatsApp'a hazır mesajlar: ödev mesajı ve ders hatırlatması">
      <div className="space-y-2 bg-muted/40 px-3 pb-4 pt-1">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <MessageCircle className="size-3.5" />
          Hazır mesajlar
        </p>
        {[homework, reminder].map((text, i) => (
          <div key={i} className="rounded-lg rounded-tr-sm bg-success-subtle px-3 py-2 shadow-sm">
            <p className="whitespace-pre-line text-[10px] leading-snug text-foreground">{text}</p>
            <p className="mt-1 flex items-center justify-end gap-1 text-[9px] text-muted-foreground">
              <Copy className="size-2.5" />
              Kopyala · WhatsApp’ta aç
            </p>
          </div>
        ))}
      </div>
    </PhoneFrame>
  )
}
