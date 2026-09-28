import { describe, it, expect } from 'vitest'
import { escapeHtml, reminderEmail } from '@/lib/email-templates'
import type { ReminderKind } from '@/lib/reminders'

const KINDS: ReminderKind[] = ['trial_3', 'trial_1', 'trial_ended', 'license_7', 'license_1', 'license_ended']

describe('e-posta şablonları', () => {
  it('kaçışlama', () => {
    expect(escapeHtml(`<b>"A" & 'B'</b>`)).toBe('&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;')
  })

  it('her türde konu, HTML, düz metin, bağlantı ve kapatma yolu var', () => {
    for (const kind of KINDS) {
      const e = reminderEmail({ kind, teacherName: 'Ayşe Yılmaz', endsAt: '2026-09-30T10:00:00Z' })
      expect(e.subject.length).toBeGreaterThan(5)
      expect(e.html).toContain('Merhaba Ayşe,')
      expect(e.text).toContain('Merhaba Ayşe,')
      expect(e.text).toContain('/teacher/ayarlar/abonelik')
      expect(e.text).toContain('kapatabilirsin')
    }
  })

  it('tarih İstanbul takvimiyle yazılır', () => {
    // 30 Eylül 22:30 UTC = 1 Ekim 01:30 İstanbul
    const e = reminderEmail({ kind: 'trial_3', teacherName: null, endsAt: '2026-09-30T22:30:00Z' })
    expect(e.subject).toContain('1 Ekim')
    expect(e.text.startsWith('Merhaba,')).toBe(true)
  })

  it('addaki HTML iletinin yapısını bozamaz', () => {
    const e = reminderEmail({ kind: 'trial_1', teacherName: '<script>x</script>', endsAt: '2026-09-29T10:00:00Z' })
    expect(e.html).not.toContain('<script>')
    expect(e.html).toContain('&lt;script&gt;')
  })
})
