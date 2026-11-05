import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { monthLastDay, periodSummary, type LedgerAccrual, type LedgerPayment } from '@/lib/finance-ledger'
import { sessionDisplayAt } from '@/lib/session-state'
import { buildParentSummary, openLineText, openTotalLabel, parentSummaryText } from '@/lib/parent-account-summary'
import { uncoveredSessions } from '@/lib/finance-coverage'

// İz Ek Paket · 04.11.2026 — madde kodlarıyla.

const acc = (id: string, date: string, amountKurus: number): LedgerAccrual => ({
  id,
  date,
  amountKurus,
  kind: 'ders',
})
const pay = (id: string, date: string, amountKurus: number): LedgerPayment => ({ id, date, amountKurus })

describe('EK-01 · güncel borç ile ay sonu bakiyesi', () => {
  // Dünya: Ekim tahakkuku 15.750, Ekim'de alınan 12.250, kalan 3.500 Kasım'da kapandı.
  const accruals = [acc('e1', '2026-10-06', 875_000), acc('e2', '2026-10-20', 700_000)]
  const payments = [pay('p1', '2026-10-25', 1_225_000), pay('p2', '2026-11-02', 200_000), pay('p3', '2026-11-04', 150_000)]

  it('Dünya / Ekim: ay sonu bakiyesi 3.500 kalır, güncel borç 0, durum Ödendi', () => {
    const oct = periodSummary(accruals, payments, '2026-10')
    expect(oct.closingBalanceKurus).toBe(350_000)
    expect(oct.currentBalanceKurus).toBe(0)
    expect(oct.periodOpenKurus).toBe(0)
    expect(oct.state).toBe('odendi')
  })

  it('Dünya / Kasım: dönem başı devreden 3.500, güncel açık 0', () => {
    const nov = periodSummary(accruals, payments, '2026-11')
    expect(nov.carriedInKurus).toBe(350_000)
    expect(nov.currentBalanceKurus).toBe(0)
    expect(nov.state).toBe('yok')
  })

  it('Yiğit / Kasım: 13.000 devir + 13.000 tahsilat → güncel 0; eski aya dönmek borç üretmez', () => {
    const a = [acc('y1', '2026-10-10', 1_300_000)]
    const p = [pay('yp', '2026-11-02', 1_300_000)]
    expect(periodSummary(a, p, '2026-11').currentBalanceKurus).toBe(0)
    expect(periodSummary(a, p, '2026-10').currentBalanceKurus).toBe(0)
    expect(periodSummary(a, p, '2026-10').state).toBe('odendi')
  })

  it('veli özeti ile finans aynı güncel tutarı gösterir', () => {
    const s = buildParentSummary(accruals.map(a => ({ ...a, unitCount: 1 })), payments)
    expect(s.totalOpenKurus).toBe(periodSummary(accruals, payments, '2026-10').currentBalanceKurus)
  })

  it('ay sonu günü', () => {
    expect(monthLastDay('2026-10')).toBe('2026-10-31')
    expect(monthLastDay('2027-02')).toBe('2027-02-28')
  })
})

describe('EK-02 · yapılan dersin gerçek zamanı', () => {
  const plan = '2026-10-17T06:00:00Z' // 09:00 İstanbul
  it('yapılmış ders gerçekleşme anıyla', () => {
    expect(sessionDisplayAt({ status: 'yapildi', actualAt: '2026-10-17T08:01:00Z', currentPlannedAt: plan })).toBe(
      '2026-10-17T08:01:00Z'
    )
  })
  it('gerçekleşme anı yoksa plan saati gerçek saat gibi verilmez', () => {
    expect(sessionDisplayAt({ status: 'yapildi', actualAt: null, currentPlannedAt: plan })).toBeNull()
  })
  it('yapılmamış ders plan anıyla', () => {
    expect(sessionDisplayAt({ status: 'planlandi', actualAt: null, currentPlannedAt: plan })).toBe(plan)
  })
})

describe('EK-04 · veli dökümü: sıra, gerçek saat, birim toplamı', () => {
  it('"1) 17 Ekim 2026 Cumartesi · 11:01 · 1 ders · 1.850 ₺"', () => {
    const s = buildParentSummary(
      [{ id: 'a', date: '2026-10-17', amountKurus: 185_000, kind: 'ders', unitCount: 1, occurredAt: '2026-10-17T08:01:00Z' }],
      []
    )
    expect(openLineText(s.openLines[0])).toBe('1) 17 Ekim 2026 Cumartesi · 11:01 · 1 ders · 1.850 ₺')
  })

  it('saat bilinmiyorsa saatsiz; numara kayıt sırası, yarım ders tek satır', () => {
    const s = buildParentSummary(
      [
        { id: 'a', date: '2026-10-03', amountKurus: 100_000, kind: 'ders', unitCount: 1 },
        { id: 'b', date: '2026-10-10', amountKurus: 50_000, kind: 'ders', unitCount: 0.5 },
        { id: 'c', date: '2026-10-01', amountKurus: 1_250_000, kind: 'aylik', unitCount: null },
      ],
      []
    )
    expect(s.openLines.map(l => l.no)).toEqual([null, 1, 2])
    expect(openLineText(s.openLines[1])).toBe('1) 3 Ekim 2026 Cumartesi · 1 ders · 1.000 ₺')
    expect(openTotalLabel(s)).toBe('Toplam · 2 kayıt · 1,5 ders')
    expect(parentSummaryText('Doğa', s, '2026-11-05')).toContain('2) 10 Ekim 2026 Cumartesi · 0,5 ders · 500 ₺')
  })
})

describe('EK-03 · ücret kaydı olmayan yapılmış dersler', () => {
  const base = {
    models: [{ model: 'ders_basi' as const, collectionTiming: 'ay_sonu' as const, validFrom: '2026-09-01', createdAt: '2026-09-01' }],
    prices: [{ priceType: 'ders_basi' as const, amountKurus: 200_000, validFrom: '2026-09-01', createdAt: '2026-09-01' }],
  }
  const session = (id: string, serviceId: string, extra: Partial<{ attended: boolean | null }> = {}) => ({
    id,
    serviceId,
    plannedAt: '2026-09-23T18:00:00Z',
    currentPlannedAt: null,
    actualAt: '2026-09-23T18:00:00Z',
    attended: extra.attended ?? null,
    isExtra: false,
  })

  it('tahakkuku olan oturum listede yok; eksik olan "eksik" çıkar (borç eklemez)', () => {
    const r = uncoveredSessions({
      ...base,
      sessions: [session('s23', 'svc'), session('s26', 'svc')],
      services: [{ id: 'svc', financeLink: 'ders_basi' }],
      accruedSessionIds: new Set(['s26']),
    })
    expect(r.map(x => [x.sessionId, x.reason])).toEqual([['s23', 'eksik']])
  })

  it('nedenler: pakete dahil, finansa dahil değil, katılmadı, fiyat yok', () => {
    const aylik = {
      models: [{ model: 'aylik_sabit' as const, collectionTiming: 'ay_basi' as const, validFrom: '2026-09-01', createdAt: '2026-09-01' }],
      prices: [],
    }
    const reasons = (services: { id: string; financeLink: 'aylik_paket' | 'ders_basi' | 'haric' | null }[], m = base, s = session('x', 'svc')) =>
      uncoveredSessions({ ...m, sessions: [s], services, accruedSessionIds: new Set() })[0].reason
    expect(reasons([{ id: 'svc', financeLink: 'aylik_paket' }], aylik)).toBe('pakete_dahil')
    expect(reasons([{ id: 'svc', financeLink: 'haric' }])).toBe('haric')
    expect(reasons([{ id: 'svc', financeLink: 'ders_basi' }], base, session('x', 'svc', { attended: false }))).toBe('katilmadi')
    expect(reasons([{ id: 'svc', financeLink: 'ders_basi' }], { ...base, prices: [] })).toBe('fiyatsiz')
  })
})

describe('154 · kütüphaneye seçerek yayın SQL sözleşmesi', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/154_ek05_kutuphane_toplu_yayin.sql'), 'utf8')
  const body = (fn: string) => {
    const start = sql.indexOf(`FUNCTION public.${fn}(`)
    return sql.slice(start, sql.indexOf('$fn$;', start))
  }

  it('iki fonksiyon da yalnız platform yöneticisi', () => {
    expect(body('admin_list_workspace_books')).toMatch(/IF NOT public\.is_platform_admin\(\)/)
    expect(body('publish_books_to_library')).toMatch(/IF NOT public\.is_platform_admin\(\)/)
    expect(body('publish_books_to_library')).toMatch(/require_admin_reason\(p_reason\)/)
  })

  it('zaten yayındaki kitap atlanır, her kitap kendi alt işleminde', () => {
    const fn = body('publish_books_to_library')
    expect(fn).toMatch(/Zaten kütüphanede/)
    expect(fn).toMatch(/EXCEPTION WHEN OTHERS THEN/)
    expect(fn).toMatch(/_copy_book_tree/)
  })

  it('anon yetkisi yok, liste öğrenci verisi döndürmez', () => {
    expect(sql).not.toMatch(/GRANT\s+EXECUTE[^;]*TO\s+[^;]*anon/i)
    expect(body('admin_list_workspace_books')).not.toMatch(/students|homework|student_/)
  })
})
