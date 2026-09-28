import { describe, it, expect } from 'vitest'
import { studentDetailNeeds, type StudentDetailNeeds, type StudentDetailTab } from '@/lib/student-detail-needs'
import { studentOverviewTabs } from '@/components/nav-config'

// Sekme başına hangi verinin çekildiği (B13). Bir sekmenin kullandığı
// veri buradan düşerse o blok sessizce boş görünür; beklenen küme bu
// yüzden elle yazılı ve her değişiklikte bilinçli güncellenmeli.

const on = (n: StudentDetailNeeds) =>
  (Object.keys(n) as (keyof StudentDetailNeeds)[]).filter((k) => n[k]).sort()

describe('öğrenci detayı: sekme → veri', () => {
  it('Genel Bakış', () => {
    expect(on(studentDetailNeeds(null))).toEqual(
      ['bookMap', 'homeworkBatches', 'notes', 'overviewCounters', 'topicSignals', 'weekOperation'].sort()
    )
  })

  it('Kitaplar: kitap haritası + envanter', () => {
    expect(on(studentDetailNeeds('kitaplar'))).toEqual(['bookMap', 'inventory'])
  })

  it('Ödevler: onay listesi, ödevler ve etkin akış kimliği', () => {
    expect(on(studentDetailNeeds('odevler'))).toEqual(
      ['homeworkBatches', 'pendingApprovalItems', 'weekOperation'].sort()
    )
  })

  it('Veliler: yalnız veli bağları ve davetler', () => {
    expect(on(studentDetailNeeds('veliler'))).toEqual(['parentsAndInvites'])
  })

  it('Not: yalnız notlar', () => {
    expect(on(studentDetailNeeds('not'))).toEqual(['notes'])
  })

  it('her sekme eşlenmiş (nav-config ile aynı küme)', () => {
    for (const t of studentOverviewTabs) {
      expect(on(studentDetailNeeds(t.slug as StudentDetailTab)).length).toBeGreaterThan(0)
    }
    expect(studentOverviewTabs.map((t) => t.slug).sort()).toEqual(['kitaplar', 'not', 'odevler', 'veliler'])
  })

  it('ağır ve sekmeye özel veri Genel Bakış’ta çekilmez', () => {
    const n = studentDetailNeeds(null)
    expect(n.pendingApprovalItems).toBe(false)
    expect(n.parentsAndInvites).toBe(false)
    expect(n.inventory).toBe(false)
  })
})
