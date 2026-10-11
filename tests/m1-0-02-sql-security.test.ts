import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// M1.0-02 (139-141) — SQL GÜVENLİK VE TUTARLILIK
//
// NEDEN BU TEST VAR
//
// Doküman §9: "Her finans kaydında workspace_id bulunmalıdır." 066/068
// finansı sahibe kilitledi (owner RLS, kompozit FK, doğrudan yazma yok);
// yeni tablolar bu kuralın dışına düşerse bir öğretmen başka bir
// kiracının fiyatlarını okuyabilirdi. Canlı veritabanı olmadan SQL
// çalıştırılamıyor; kurallar metin olarak denetleniyor (repodaki diğer
// *-sql testleriyle aynı yöntem). Davranış PGlite üzerinde 001-141
// zinciriyle ayrıca doğrulandı.
// ============================================================

const DIR = join(process.cwd(), 'supabase/migrations')
const FILES = {
  '139': readFileSync(join(DIR, '139_service_cadence_and_pricing.sql'), 'utf8'),
  '140': readFileSync(join(DIR, '140_session_plan_vs_outcome.sql'), 'utf8'),
  '141': readFileSync(join(DIR, '141_finance_v1.sql'), 'utf8'),
}
const ALL = Object.values(FILES).join('\n')

function withoutComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
}

/** `CREATE OR REPLACE FUNCTION public.ad(` → gövde ($fn$ … $fn$). */
function functionBodies(sql: string): { name: string; header: string; body: string }[] {
  const out: { name: string; header: string; body: string }[] = []
  const re = /CREATE OR REPLACE FUNCTION public\.(\w+)\(([\s\S]*?)\$fn\$([\s\S]*?)\$fn\$/g
  let m: RegExpExecArray | null
  while ((m = re.exec(withoutComments(sql)))) out.push({ name: m[1], header: m[2], body: m[3] })
  return out
}

describe('yeni tablolar sahibe/çalışma alanına kilitli', () => {
  const ownerOnly = ['student_finance_models', 'student_price_versions', 'finance_expenses']

  it.each(ownerOnly)('%s · RLS açık, yalnız owner okur, doğrudan yazma yok', (table) => {
    expect(ALL).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`))
    expect(ALL).toMatch(
      new RegExp(`CREATE POLICY \\w+ ON public\\.${table}\\s+FOR SELECT\\s+USING \\(${table}\\.workspace_id IN \\(SELECT public\\.my_workspace_ids\\(ARRAY\\['owner'::text\\]\\)\\)\\)`)
    )
    expect(ALL).toMatch(new RegExp(`REVOKE INSERT, UPDATE, DELETE ON public\\.${table} FROM authenticated`))
    expect(ALL).toMatch(new RegExp(`REVOKE ALL ON public\\.${table} FROM anon`))
  })

  it.each(['student_finance_models', 'student_price_versions', 'finance_expenses'])(
    '%s · öğrenci kompozit FK ile aynı çalışma alanına bağlı',
    (table) => {
      expect(ALL).toMatch(
        new RegExp(`ALTER TABLE public\\.${table}\\s+ADD CONSTRAINT \\w+\\s+FOREIGN KEY \\(workspace_id, student_id\\)\\s+REFERENCES public\\.students \\(workspace_id, id\\)`)
      )
    }
  )

  it('plan geçmişi owner/teacher okur, yazma yalnız RPC', () => {
    expect(FILES['140']).toMatch(/ALTER TABLE public\.session_plan_history ENABLE ROW LEVEL SECURITY/)
    expect(FILES['140']).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.session_plan_history FROM authenticated/)
  })
})

describe('SECURITY DEFINER fonksiyonlar yetkiyi kendisi kontrol ediyor', () => {
  // İç yardımcılar: dışarıya açılmıyorlar (REVOKE … FROM authenticated)
  // ya da yalnız tetikleyiciden/başka DEFINER fonksiyondan çağrılıyorlar.
  const INTERNAL = new Set([
    'refresh_makeup_status',
    'tg_refresh_makeup_status',
    'sync_session_accrual',
    'tg_session_default_current_plan',
    // 075 imzasını koruyan sarmalayıcılar: yetkiyi çağırdıkları _v2 kontrol eder.
    'set_session_outcome',
    'update_student_service',
  ])

  const definers = Object.entries(FILES).flatMap(([file, sql]) =>
    functionBodies(sql)
      .filter((f) => /SECURITY DEFINER/.test(f.body.split('AS')[0] ?? '') || /SECURITY DEFINER/.test(f.header))
      .map((f) => ({ ...f, file }))
  )

  it('denetlenecek fonksiyon bulundu', () => {
    expect(definers.length).toBeGreaterThan(15)
  })

  it.each(definers.filter((f) => !INTERNAL.has(f.name)).map((f) => [f.file, f.name, f.body]))(
    '%s · %s',
    (_file, _name, body) => {
      expect(body).toMatch(/has_workspace_role\(/)
    }
  )

  it('iç yardımcılar dışarıya açık değil', () => {
    for (const name of ['refresh_makeup_status', 'sync_session_accrual', 'price_at', 'finance_model_at']) {
      expect(ALL).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon, authenticated`))
    }
  })

  it('finans yazımı yalnız sahip (owner) — öğretmen değil', () => {
    const owners = [
      'set_finance_model',
      'add_price_version',
      'delete_price_version',
      'add_manual_accrual',
      'add_finance_payment_v2',
      'add_expense',
      'ensure_period_accruals',
      'backfill_missing_accruals',
    ]
    const bodies = functionBodies(ALL)
    for (const name of owners) {
      const f = bodies.find((b) => b.name === name)
      expect(f, name).toBeDefined()
      expect(f!.body, name).toMatch(/has_workspace_role\([^)]*ARRAY\['owner'\]\)/)
    }
  })
})

describe('140 · plan ve gerçekleşme ayrı', () => {
  const sql = withoutComments(FILES['140'])

  it("'ertelendi' durumu kaldırıldı, veri plan geçmişine taşındı", () => {
    expect(sql).toMatch(/CHECK \(status IN \('planlandi', 'yapildi', 'yapilmadi', 'iptal'\)\)/)
    expect(sql).toMatch(/INSERT INTO public\.session_plan_history[\s\S]*?WHERE ss\.status = 'ertelendi'/)
  })

  it('planı değiştir durumu değiştirmez, yalnız güncel planı ve geçmişi yazar', () => {
    const f = functionBodies(FILES['140']).find((x) => x.name === 'reschedule_session')!
    expect(f.body).toMatch(/SET current_planned_at = p_new_at/)
    expect(f.body).not.toMatch(/status\s*=\s*'ertelendi'/)
    expect(f.body).toMatch(/INSERT INTO public\.session_plan_history/)
  })

  it('hizmet düzenlemesi elle taşınan/eklenen oturumu silmez', () => {
    const f = functionBodies(FILES['140']).find((x) => x.name === 'update_student_service_v2')!
    expect(f.body).toMatch(/source = 'takvim'/)
    expect(f.body).toMatch(/current_planned_at = planned_at/)
  })

  it('aynı oturum iki kez telafi edilmez', () => {
    const f = functionBodies(FILES['140']).find((x) => x.name === 'create_makeup_session')!
    expect(f.body).toMatch(/c\.makeup_of_session_id = p_session_id AND c\.status IN \('planlandi', 'yapildi'\)/)
  })

  it('ay atfı sayaç ve listede aynı ifade (075/082 kuralı 140 içinde de)', () => {
    const exprs = FILES['140'].match(
      /date_trunc\(\s*'month',\s*COALESCE\(asil\.planned_at, ss\.planned_at\) AT TIME ZONE 'Europe\/Istanbul'\s*\)::DATE/g
    )
    // student_service_session_view + student_service_month_view
    expect(exprs?.length).toBe(2)
  })
})

describe('141 · tahakkuk idempotent ve tarihsel', () => {
  it('oturum başına tek tahakkuk, ayda tek aylık ücret', () => {
    expect(FILES['141']).toMatch(/ON CONFLICT \(service_session_id\) WHERE service_session_id IS NOT NULL/)
    expect(FILES['141']).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_lessons_month_fee\s+ON public\.finance_lessons \(student_id, lesson_date\)\s+WHERE kind = 'aylik'/)
  })

  it('fiyat gerçekleşme tarihindeki sürümden okunur', () => {
    const f = functionBodies(FILES['141']).find((x) => x.name === 'sync_session_accrual')!
    expect(f.body).toMatch(/price_at\(v_ss\.student_id, v_price_type, v_price_date\)/)
  })

  it('aylık ücret satırı silinmez, sıfırlanır (yeniden üretilmesin)', () => {
    const f = functionBodies(FILES['141']).find((x) => x.name === 'delete_finance_entry')!
    expect(f.body).toMatch(/v_row_kind = 'aylik'[\s\S]*?SET unit_price_kurus = 0/)
  })

  it('banka alanları hazır, V1 yazmaz', () => {
    for (const col of ['bank_name', 'bank_transaction_id', 'sender_name', 'transacted_at', 'gross_amount_kurus', 'match_status']) {
      expect(FILES['141']).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`))
    }
    const f = functionBodies(FILES['141']).find((x) => x.name === 'add_finance_payment_v2')!
    expect(f.body).toMatch(/'manual'/)
    expect(f.body).not.toMatch(/bank_transaction_id/)
  })

  it('veli rozeti fonksiyonuna (086) dokunulmadı — veliye tutar gitmez', () => {
    expect(ALL).not.toMatch(/FUNCTION public\.student_month_payment_state/)
  })
})
