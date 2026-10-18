import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { periodSummary, sessionPaymentStates, type LedgerAccrual } from '@/lib/finance-ledger'
import { buildMonthSummary, monthSummaryLine, type MonthCounterRow } from '@/lib/session-state'
import { studentSchema } from '@/lib/validation'

// ============================================================
// FİNANS TESTLERİ TEST 01-02 ARA REVİZYONU (17.10.2026)
//
// Kullanıcının test öğrencileriyle doğruladığı sayılar burada sabit:
// TEST 01 · Ada (1 ders × 1.750 TL, tek tık tahsil) ve TEST 02 · Bora
// (esnek ritim; 2 + 1,5 + 2 ders × 2.500 TL, 10.000 TL kısmi tahsilat,
// Kasım'a 3.750 TL devir).
// ============================================================

type A = LedgerAccrual & { sessionId: string | null }
const ders = (id: string, date: string, amountKurus: number, sessionId: string | null = id): A => ({
  id,
  date,
  amountKurus,
  kind: 'ders',
  sessionId,
})

describe('TEST 02 · Bora — esnek ritim ay toplamı ve devir', () => {
  const accruals = [
    ders('s1', '2026-10-06', 500_000), // 2 ders × 2.500
    ders('s2', '2026-10-13', 375_000), // 1,5 ders × 2.500
    ders('s3', '2026-10-20', 500_000), // 2 ders × 2.500
  ]
  const payments = [{ id: 'p1', date: '2026-10-21', amountKurus: 1_000_000 }]

  it('Ekim toplamı 13.750 TL, 10.000 TL ödeme sonrası 3.750 TL kalan', () => {
    const oct = periodSummary(accruals, payments, '2026-10')
    expect(oct.periodAccruedKurus).toBe(1_375_000)
    expect(oct.periodCollectedKurus).toBe(1_000_000)
    expect(oct.closingBalanceKurus).toBe(375_000)
    expect(oct.state).toBe('kismi')
  })

  it('Kasım geçişinde Ekim toplamı sabit kalır, 3.750 TL devreder', () => {
    const nov = periodSummary(accruals, payments, '2026-11')
    expect(nov.carriedInKurus).toBe(375_000)
    expect(nov.periodAccruedKurus).toBe(0)
    expect(periodSummary(accruals, payments, '2026-10').periodAccruedKurus).toBe(1_375_000)
  })

  it('FIFO: ilk iki oturum kapanır, üçüncüde 3.750 TL bekler', () => {
    const states = sessionPaymentStates(accruals, payments)
    expect(states.get('s1')).toEqual({ amountKurus: 500_000, paidKurus: 500_000 })
    expect(states.get('s2')).toEqual({ amountKurus: 375_000, paidKurus: 375_000 })
    expect(states.get('s3')).toEqual({ amountKurus: 500_000, paidKurus: 125_000 })
  })
})

describe('Satır tahsil durumu (FIFO, karar 19.10.2026)', () => {
  it('TEST 01 · Ada: 1.750 TL tahsilat dersi kapatır', () => {
    const states = sessionPaymentStates(
      [ders('ada1', '2026-10-15', 175_000)],
      [{ id: 'p', date: '2026-10-15', amountKurus: 175_000 }]
    )
    expect(states.get('ada1')).toEqual({ amountKurus: 175_000, paidKurus: 175_000 })
  })

  it('manuel tahakkuk oturum haritasına girmez ama FIFO sırasını etkiler', () => {
    const states = sessionPaymentStates(
      [{ ...ders('devir', '2026-09-30', 100_000, null), kind: 'devir' }, ders('s', '2026-10-01', 175_000)],
      [{ id: 'p', date: '2026-10-01', amountKurus: 175_000 }]
    )
    expect(states.has('devir')).toBe(false)
    expect(states.get('s')).toEqual({ amountKurus: 175_000, paidKurus: 75_000 })
  })
})

describe('Esnek ritimde payda üretilmez', () => {
  const row = (p: Partial<MonthCounterRow>): MonthCounterRow => ({
    kind: 'ders',
    flexible: false,
    planlanan: 0,
    yapilan: 0,
    bekleyen: 0,
    ek_ders: 0,
    telafi_bekleyen: 0,
    ...p,
  })

  it('TEST 02: esnek 1 yapıldı + 1 planlı → "1/2" değil', () => {
    const line = monthSummaryLine(
      buildMonthSummary('Ekim 2026', [row({ flexible: true, planlanan: 2, yapilan: 1, bekleyen: 1 })])
    )
    expect(line).toBe('Ekim 2026: Ders 1 yapıldı, 1 planlı')
    expect(line).not.toContain('/')
  })

  it('sabit ritimde kesir korunur', () => {
    expect(monthSummaryLine(buildMonthSummary('Ekim 2026', [row({ planlanan: 5, yapilan: 3, bekleyen: 2 })]))).toBe(
      'Ekim 2026: Ders 3/5 yapıldı'
    )
  })

  it('karma: kesir yalnız sabit hizmetten', () => {
    const line = monthSummaryLine(
      buildMonthSummary('Ekim 2026', [
        row({ planlanan: 4, yapilan: 2 }),
        row({ flexible: true, planlanan: 1, yapilan: 1 }),
      ])
    )
    expect(line).toBe('Ekim 2026: Ders 2/4 yapıldı + esnek 1 yapıldı')
  })
})

describe('Yeni öğrenci: telefon isteğe bağlı', () => {
  it('telefonsuz öğrenci açılır', () => {
    expect(studentSchema.safeParse({ fullName: 'Test Bora', phone: '' }).success).toBe(true)
    expect(studentSchema.safeParse({ fullName: 'Test Bora' }).success).toBe(true)
  })
})

describe('147 SQL', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/147_finance_quick_collect.sql'), 'utf8')
  const code = sql
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
  const body = (name: string) => {
    const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(([\\s\\S]*?)\\$fn\\$([\\s\\S]*?)\\$fn\\$`).exec(code)
    expect(m, name).not.toBeNull()
    return m![2]
  }

  it('complete_session_and_collect yalnız sahibe, tek işlemde üç kayıt', () => {
    const b = body('complete_session_and_collect')
    expect(b).toMatch(/has_workspace_role\(v_session\.workspace_id, ARRAY\['owner'\]\)/)
    expect(b).toMatch(/set_session_outcome_v2\(p_session_id, 'yapildi'\)/)
    expect(b).toMatch(/add_finance_payment_v2\(/)
    expect(b).toMatch(/'nakit'/)
    // Fiyatsız: istisna ile her şey geri alınır (yarım kayıt kalmaz).
    expect(b).toMatch(/v_amount IS NULL[\s\S]*RAISE EXCEPTION/)
  })

  it('görüşmeden doğan tahakkuk Finans\'tan silinemez', () => {
    const b = body('delete_finance_entry')
    expect(b).toMatch(/service_session_id/)
    expect(b).toMatch(/v_session_id IS NOT NULL THEN\s+RAISE EXCEPTION/)
    // Kontrol silmeden ÖNCE.
    expect(b.indexOf('v_session_id IS NOT NULL')).toBeLessThan(b.indexOf('DELETE FROM public.finance_lessons'))
  })

  it('anon\'a kapalı, authenticated\'a açık', () => {
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.complete_session_and_collect\(UUID\) FROM PUBLIC, anon/)
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.complete_session_and_collect\(UUID\) TO authenticated/)
    expect(code).not.toMatch(/TO anon/)
  })
})
