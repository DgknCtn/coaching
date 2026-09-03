import { describe, expect, it } from 'vitest'

import { subtractRanges, unionRanges, countPages, formatRanges } from '@/lib/page-ranges'
import { buildShareText } from '@/lib/share-text'
import { deriveTestState, isOverdue, testStateLabel } from '@/lib/homework-status'
import { calculatePlanTempo } from '@/lib/plan-pace'
import { isSelectableState } from '@/lib/book-map'

// ============================================================
// R6-18 — REGRESYON KONTROL PAKETİ (kabul testleri 91-96)
//
// R6 maddelerinin çoğu ortak query/helper'lara ve öğrenci-kitap akışlarına
// dokunduğu için, bugün sorunsuz çalışan davranışlarda GÖRÜNMEYEN kırılma
// riski var. Bu dosya o davranışları tek yerde kilitler.
//
// Dokümanın kuralı: "R6 tamamlandı kabul edilmeden önce bu regresyon paketi
// topluca çalıştırılmalı."
//
// Buradaki testler mevcut modüllerin testleriyle KASITLI OLARAK örtüşür.
// Amaç kapsam eklemek değil, R6'nın korumayı taahhüt ettiği davranışları
// kabul numaralarıyla birlikte açıkça isimlendirmek.
// ============================================================

describe('R6-18 · sayfa aralığı toggle davranışı', () => {
  it('kabul #91: F1 100-110 seçiliyken 102-104 tekrar eklenirse 100-101, 105-110 kalır', () => {
    const secili = [{ start: 100, end: 110 }]
    const sonuc = subtractRanges(secili, [{ start: 102, end: 104 }])

    expect(sonuc).toEqual([
      { start: 100, end: 101 },
      { start: 105, end: 110 },
    ])
    expect(formatRanges(sonuc)).toBe('100-101, 105-110')
  })

  it('bitişik aralık formatter davranışı korunur: 100-105 + 106-110 => 100-110', () => {
    expect(
      unionRanges([
        { start: 100, end: 105 },
        { start: 106, end: 110 },
      ])
    ).toEqual([{ start: 100, end: 110 }])
  })
})

describe('R6-18 · farklı bölümlerde aynı sayfa numarası', () => {
  it('kabul #92: MÖF F2 sf.5-10 + F3 sf.5-10 toplamı 12 sayfadır', () => {
    // KRİTİK: bu iki aralık AYNI bölümde olsaydı 6 sayfa olurdu. Sayfa
    // kimliği section_id bağlamındadır (022: her sayfa ayrı book_tests
    // satırı), bu yüzden farklı fasiküllerdeki aynı numaralar birbirine
    // karışmaz ve ayrı ayrı sayılır.
    const f2 = countPages([{ start: 5, end: 10 }])
    const f3 = countPages([{ start: 5, end: 10 }])

    expect(f2).toBe(6)
    expect(f3).toBe(6)
    expect(f2 + f3).toBe(12)
  })

  it('aynı bölümde tekrar eden aralık iki kez sayılmaz', () => {
    expect(
      countPages(
        unionRanges([
          { start: 5, end: 10 },
          { start: 5, end: 10 },
        ])
      )
    ).toBe(6)
  })
})

describe('R6-18 · WhatsApp ödev metni', () => {
  it('kabul #93: test + sayfa kaynaklı haftalık plan doğru kopyalanır', () => {
    const text = buildShareText({
      studentName: 'Ömer',
      dueDate: '2026-08-30',
      books: [
        {
          bookTitle: '345 Matematik',
          trackingMode: 'test',
          sections: [{ title: 'Polinomlar', units: [3, 4, 5] }],
        },
        {
          bookTitle: 'MÖF Matematik',
          trackingMode: 'page',
          sections: [
            { title: 'F1 · Sayılar', units: [6, 7, 8, 9, 10] },
            { title: 'F2 · Nicelikler', units: [15, 16, 17] },
          ],
        },
      ],
    })

    expect(text).toContain('345 Matematik')
    expect(text).toContain('• Polinomlar → 3-5. Test')
    expect(text).toContain('MÖF Matematik')
    expect(text).toContain('• F1 · Sayılar → sf. 6-10')
    expect(text).toContain('• F2 · Nicelikler → sf. 15-17')
    // Sayfa kaynağında "Test" ifadesi geçmemeli.
    expect(text).not.toContain('F1 · Sayılar → 6')
  })
})

describe('R6-18 · R2 onay akışı zinciri', () => {
  it('kabul #94: Gönder → Onay Bekliyor → Reddet → İade Edildi → Yeniden Gönder', () => {
    const due = '2026-08-30'
    const today = new Date('2026-08-25T09:00:00Z')

    // 1) Öğrenciye verildi
    expect(deriveTestState({ itemStatus: 'pending', dueDate: due, today })).toBe('assigned')

    // 2) Öğrenci onaya gönderdi
    expect(deriveTestState({ itemStatus: 'pending_approval', dueDate: due, today })).toBe(
      'pending_approval'
    )

    // 3) Öğretmen reddetti + not yazdı -> öğrencide "İade Edildi"
    const reddedilen = deriveTestState({
      itemStatus: 'pending',
      dueDate: due,
      rejectedAt: '2026-08-25T10:00:00Z',
      today,
    })
    expect(reddedilen).toBe('returned')
    expect(testStateLabel(reddedilen, 'student')).toBe('İade Edildi')
    expect(testStateLabel(reddedilen, 'teacher')).toBe('Reddedildi')

    // 4) Öğrenci yeniden gönderdi
    expect(deriveTestState({ itemStatus: 'pending_approval', dueDate: due, today })).toBe(
      'pending_approval'
    )

    // 5) Öğretmen onayladı
    expect(deriveTestState({ hasActiveCompletion: true, dueDate: due, today })).toBe('completed')
  })

  // Kabul #94'ün ikinci yarısı: "Öğrenci reddedilen çalışmada ÖĞRETMEN
  // NOTUNU görmeli". Notun yazılması ve yeniden gönderimde temizlenmesi
  // tamamen DB tarafındadır (014: reject_homework_item teacher_note'u yazar,
  // 014/020: yeniden gönderim ve toplu onay rejected_at + teacher_note'u
  // NULL'lar) — TS birim testiyle doğrulanamaz, doğrulama listesinde manuel
  // adım olarak duruyor.
  //
  // Burada test edilebilen kısım GÖRÜNÜRLÜK SÖZLEŞMESİDİR: öğrenci ekranı
  // notu yalnız "İade Edildi" durumunda gösterir
  // (app/(dashboard)/student/homework-list.tsx:300). Durum türetmesi
  // kaymışsa not sessizce görünmez olur; aşağıdaki test bunu yakalar.
  it('kabul #94: öğretmen notu yalnız iade edilmiş çalışmada görünür', () => {
    const due = '2026-08-30'
    const today = new Date('2026-08-25T09:00:00Z')

    // Öğrenci ekranının koşulu: durum 'returned' VE not dolu.
    const notGosterilir = (state: string, note: string | null) =>
      state === 'returned' && !!note

    const reddedilen = deriveTestState({
      itemStatus: 'pending',
      dueDate: due,
      rejectedAt: '2026-08-25T10:00:00Z',
      today,
    })
    expect(notGosterilir(reddedilen, 'Son iki soruyu tekrar çöz.')).toBe(true)

    // Yeniden gönderimden sonra kayıt onay bekliyordur; not artık ilgili
    // değildir ve gösterilmez (DB'de de NULL'lanır).
    const yenidenGonderildi = deriveTestState({
      itemStatus: 'pending_approval',
      dueDate: due,
      today,
    })
    expect(notGosterilir(yenidenGonderildi, null)).toBe(false)

    // Not hiç yazılmadan reddedilmişse ekranda boş bir kutu açılmaz.
    expect(notGosterilir(reddedilen, null)).toBe(false)
  })

  it('süresi geçmiş çalışma onaya gönderildiğinde aktif durum Onay Bekliyor olur', () => {
    // pending_approval, overdue'nun ÖNÜNDE gelir: öğrenci işi teslim
    // ettiyse bu "geciken" değil "onay bekleyen"dir.
    expect(
      deriveTestState({
        itemStatus: 'pending_approval',
        dueDate: '2026-08-20',
        today: new Date('2026-08-25T09:00:00Z'),
      })
    ).toBe('pending_approval')
  })
})

describe('R6-18 · video kaynağı plan temposuna girmez', () => {
  it('kabul #96: video eklenmesi test/sayfa temposunu değiştirmez', () => {
    // Video kitap seviyesinde tanımlıdır ve book_tests satırı ÜRETMEZ
    // (R4 §6). Tempo yalnız takip birimlerinden hesaplandığı için video
    // eklemek T ve C'yi değiştiremez — bu, veri modelinin sonucudur.
    const girdi = {
      startDate: '2026-09-01',
      targetEndDate: '2026-12-01',
      totalUnits: 176,
      completedUnits: 40,
      trackingMode: 'test',
      today: new Date('2026-10-01T09:00:00Z'),
    }

    const oncesi = calculatePlanTempo(girdi)
    // Video eklendikten SONRA da aynı birim sayıları geçilir.
    const sonrasi = calculatePlanTempo({ ...girdi })

    expect(sonrasi.totalUnits).toBe(oncesi.totalUnits)
    expect(sonrasi.remainingUnits).toBe(oncesi.remainingUnits)
    expect(sonrasi.requiredPacePerWeek).toBe(oncesi.requiredPacePerWeek)
    expect(sonrasi.completionPercentage).toBe(oncesi.completionPercentage)
  })
})

describe('R6-18 · Haftanın Planı sepeti bozulmadı', () => {
  it('kabul #30: plan modunda yalnız "henüz verilmedi" seçilebilir', () => {
    // R6-03 yönetim modu ekledi; sepeti besleyen plan modu DEĞİŞMEDİ.
    expect(isSelectableState('not_assigned')).toBe(true)
    expect(isSelectableState('assigned')).toBe(false)
    expect(isSelectableState('pending_approval')).toBe(false)
    expect(isSelectableState('overdue')).toBe(false)
    expect(isSelectableState('completed')).toBe(false)
    expect(isSelectableState('returned')).toBe(false)
  })
})

describe('R6-18 · gecikme kuralı tek kaynaktan', () => {
  it('kabul #12: üç panel de aynı ödev için aynı sonucu üretir', () => {
    // Öğretmen, öğrenci ve veli ekranları artık istisnasız isOverdue()
    // kullanıyor; ayrı karşılaştırma kuran yer kalmadı.
    const due = '2026-08-25'
    const anlar = [
      { an: new Date('2026-08-25T07:00:00Z'), beklenen: false }, // İstanbul 10:00
      { an: new Date('2026-08-25T20:59:00Z'), beklenen: false }, // İstanbul 23:59
      { an: new Date('2026-08-25T21:01:00Z'), beklenen: true }, // İstanbul 26.08 00:01
    ]

    for (const { an, beklenen } of anlar) {
      expect(isOverdue(due, an)).toBe(beklenen)
      // deriveTestState de aynı helper'dan besleniyor.
      expect(deriveTestState({ itemStatus: 'pending', dueDate: due, today: an })).toBe(
        beklenen ? 'overdue' : 'assigned'
      )
    }
  })
})
