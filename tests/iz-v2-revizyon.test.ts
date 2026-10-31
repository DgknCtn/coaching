import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildShareText, groupPublishedUnits } from '@/lib/share-text'
import { formatIsoDayDate, formatSessionDayDate } from '@/lib/service-structure'
import { buildParentSummary, parentSummaryText } from '@/lib/parent-account-summary'
import { flowShortLabel, labelFlows } from '@/lib/open-homework'

// İz Birleşik Revizyon V2 (31.10.2026) — madde kodlarıyla.

describe('H01 · kitapsız plan mesajı', () => {
  it('yalnız akademik görev içeren plan mesaja girer (kitap yok)', () => {
    const text = buildShareText({
      studentName: 'Ali',
      dueDate: '2026-11-08',
      today: '2026-11-01',
      books: [],
      tasks: [
        { scopeName: 'AYT Fizik', title: 'Tüm formülleri çıkar', kind: 'gorev' },
        { scopeName: 'TYT Kimya', title: 'Yazılı hazırlığı', kind: 'checklist', checklist: ['Redox', 'Asit-Baz'] },
        { scopeName: '11. Sınıf Fizik', title: 'Soru çözümü', kind: 'sure', targetMinutes: 120 },
      ],
    })
    expect(text).toBe(
      [
        'Merhaba Ali,',
        '',
        'Bu haftaki çalışmaların:',
        '',
        'Teslim: 8 Kasım 2026 Pazar (7 gün sonra)',
        '',
        'Akademik görevler',
        '• AYT Fizik · Tüm formülleri çıkar',
        '• TYT Kimya · Yazılı hazırlığı',
        '   – Redox',
        '   – Asit-Baz',
        '• 11. Sınıf Fizik · Soru çözümü (120 dk)',
      ].join('\n')
    )
  })

  it('görev yoksa mevcut çıktı değişmez', () => {
    const base = { studentName: 'Ali', dueDate: '2026-11-08', today: '2026-11-01', books: [] }
    expect(buildShareText({ ...base, tasks: [] })).toBe(buildShareText(base))
  })
})

describe('R04 · güncel mesaj — yayımlanmış kalemler birer kez', () => {
  it('aynı haftaya sonradan eklenen iş tek kitap altında, tekrar etmeden', () => {
    const unit = (sectionId: string, sectionTitle: string, n: number) => ({
      bookId: 'b1',
      bookTitle: '345 Matematik',
      trackingMode: 'test',
      sectionId,
      sectionTitle,
      unitNumber: n,
    })
    const books = groupPublishedUnits([
      unit('s2', 'Türev', 12),
      unit('s1', 'Limit', 3),
      unit('s1', 'Limit', 4),
      unit('s1', 'Limit', 3), // ikinci yayında aynı test
    ])
    expect(books).toEqual([
      {
        bookTitle: '345 Matematik',
        trackingMode: 'test',
        unitCount: 3,
        sections: [
          { title: 'Limit', units: [3, 4] },
          { title: 'Türev', units: [12] },
        ],
      },
    ])
  })
})

describe('R08 · okunabilir tarih', () => {
  it('ders satırı: "13 Ekim Salı · 18:00" (yıl yok)', () => {
    expect(formatSessionDayDate('2026-10-13T15:00:00Z', true)).toBe('13 Ekim Salı · 18:00')
  })
  it('finans satırı: "13 Ekim Salı"', () => {
    expect(formatIsoDayDate('2026-10-13')).toBe('13 Ekim Salı')
  })
  it('dönemler arası listede yıl satırda', () => {
    expect(formatIsoDayDate('2026-09-24', true)).toBe('24 Eylül 2026 Perşembe')
  })
})

describe('R09 · Veli Hesap Özeti', () => {
  const accruals = [
    { id: 'a1', date: '2026-09-24', amountKurus: 160000, kind: 'ders' as const, unitCount: 1 },
    { id: 'a2', date: '2026-10-13', amountKurus: 160000, kind: 'ders' as const, unitCount: 1 },
    { id: 'a3', date: '2026-10-20', amountKurus: 160000, kind: 'ders' as const, unitCount: 1 },
  ]

  it('kısmi ödemede "Ödenen / Açık", FIFO en eski dersten', () => {
    const s = buildParentSummary(accruals, [{ id: 'p1', date: '2026-10-25', amountKurus: 200000 }])
    expect(s.openLines.map(l => [l.id, l.paidKurus, l.openKurus])).toEqual([
      ['a2', 40000, 120000],
      ['a3', 0, 160000],
    ])
    expect(s.totalOpenKurus).toBe(280000)
    expect(s.openUnits).toBe(2)

    const text = parentSummaryText('Taha', s, '2026-10-31')
    expect(text).toContain('13 Ekim 2026 Salı · 1 ders — Ödenen 400 ₺ / Açık 1.200 ₺')
    expect(text).toContain('Toplam · 2 ders — 2.800 ₺')
    expect(text).toContain('Son tahsilatlar')
  })

  it('ödeme yoksa tüm dersler açık; toplam · 3 ders', () => {
    const s = buildParentSummary(accruals, [])
    expect(s.openLines).toHaveLength(3)
    expect(parentSummaryText('Taha', s, '2026-10-31')).toContain('Toplam · 3 ders — 4.800 ₺')
  })
})

describe('R03 · hafta etiketi', () => {
  it('en eski hafta 1. Hafta; akışsız kalem "Haftasız"', () => {
    const flows = labelFlows([
      { id: 'f2', starts_at: '2026-10-12T07:00:00Z', due_at: '2026-10-18T07:00:00Z', status: 'closed' },
      { id: 'f1', starts_at: '2026-10-05T07:00:00Z', due_at: '2026-10-11T07:00:00Z', status: 'closed' },
      { id: 'f3', starts_at: '2026-10-19T07:00:00Z', due_at: '2026-10-25T07:00:00Z', status: 'active' },
    ])
    expect(flows.map(f => [f.id, flowShortLabel(f)])).toEqual([
      ['f1', '1. Hafta'],
      ['f2', '2. Hafta'],
      ['f3', '3. Hafta'],
    ])
    expect(flowShortLabel(null)).toBe('Haftasız')
  })
})

describe('152 · devir ve geçerlilik SQL sözleşmesi', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/152_iz_v2_devir_ve_gecerlilik.sql'),
    'utf8'
  )
  const body = (fn: string) => {
    const start = sql.indexOf(`FUNCTION public.${fn}(`)
    return sql.slice(start, sql.indexOf('$fn$;', start))
  }

  it('K5 · yalnız bekleyen kalem devredilir; devredilmiş kalem atlanır', () => {
    const carry = body('carry_homework_items')
    expect(carry).toMatch(/v_src\.status <> 'pending'/)
    expect(carry).toMatch(/v_src\.carried_to_item_id IS NOT NULL/)
    // Kaynak silinmez, devredildi olarak kapanır.
    expect(carry).not.toMatch(/DELETE FROM public\.homework_items/)
    expect(carry).toMatch(/release_reason = 'Devredildi'/)
  })

  it('K5 · bir kalemin en fazla bir devri olur (tekil indeks)', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_homework_items_carried_from/)
  })

  it('K5 · yeniden aktifleştirme devredilen kalemi diriltmez', () => {
    expect(body('restore_batch_to_active_load')).toMatch(/hi\.carried_to_item_id IS NULL/)
  })

  it('K6 · tarih düzeltme tahakkuk tablosuna dokunmaz', () => {
    const fix = body('correct_finance_model_date')
    expect(fix).not.toMatch(/finance_lessons/)
    expect(fix).toMatch(/has_workspace_role\(v_workspace, ARRAY\['owner'\]\)/)
  })
})

describe('153 · seçimli görev devri ve academic_scopes RLS', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/153_iz_v2_secimli_gorev_devri_ve_scope_rls.sql'),
    'utf8'
  )

  it('R04 · yalnız açık görev taşınır, geldiği hafta korunur', () => {
    const start = sql.indexOf('FUNCTION public.carry_academic_tasks(')
    const fn = sql.slice(start, sql.indexOf('$fn$;', start))
    expect(fn).toMatch(/status = 'open'/)
    expect(fn).toMatch(/origin_flow_id = COALESCE\(origin_flow_id, weekly_flow_id, v_flow_id\)/)
    expect(fn).toMatch(/has_workspace_role\(s\.workspace_id, ARRAY\['owner', 'teacher'\]\)/)
  })

  it('SEC-01 · öğrenci politikası yalnız authenticated (anon 42501 almaz)', () => {
    expect(sql).toMatch(
      /CREATE POLICY academic_scopes_select_student ON public\.academic_scopes\s+FOR SELECT TO authenticated/
    )
    expect(sql).not.toMatch(/GRANT\s+SELECT[^;]*TO\s+anon/i)
  })

  it('R04 · ekran açılışında görev devri yapılmaz', () => {
    for (const page of [
      'app/(dashboard)/student/haftam/page.tsx',
      'app/(dashboard)/teacher/students/[studentId]/haftalik-akis/page.tsx',
    ]) {
      const src = readFileSync(join(process.cwd(), page), 'utf8')
      expect(src, page).not.toMatch(/rpc\('roll_open_tasks_to_flow'/)
    }
  })
})
