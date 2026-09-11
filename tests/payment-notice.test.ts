import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { monthPaymentState } from '@/lib/finance'

// ============================================================
// VELİ ÖDEME BİLDİRİMİ VE AY DURUMU — R7-04 Rev.3 §8
//
// NEDEN BU TEST VAR
//
// İki ayrı mahremiyet sınırı burada kesişiyor ve ikisi de sessizce
// delinebilir:
//
//   1. PARA VELİYE KAPALI (066). Veliye "Ödendi / Bekliyor" gösterilmesi
//      gerekiyor ama TUTAR gösterilmemeli. Durumu üreten fonksiyon
//      SECURITY DEFINER — yani RLS'i atlıyor. Yetki kontrolü gövdeden
//      düşerse herkes herkesin ödeme durumunu okur.
//
//   2. DEFTERİN SAHİBİ ÖĞRETMEN. Velinin "ödedim" demesi bir TALEP;
//      `finance_payments`'a satır yazsaydı öğretmenin defteri veli
//      tarafından değiştirilebilir olurdu.
//
// Ayrıca veli ile öğretmen AYNI ay için aynı rozeti görmeli: eşikler
// SQL ile lib/finance.ts'te iki kez yazılı ve ayrışabilirler.
// ============================================================

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/086_parent_service_and_payment_notice.sql'),
  'utf8'
)

function fnBody(name: string): string {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  expect(start, `${name} bulunamadı`).toBeGreaterThan(-1)
  const end = SQL.indexOf('$fn$;', start)
  expect(end, `${name} gövdesi kapanmıyor`).toBeGreaterThan(start)
  return SQL.slice(start, end)
}

describe('student_month_payment_state · yetki', () => {
  const body = fnBody('student_month_payment_state')

  it('gövde okunabildi (test boşa geçmesin)', () => {
    expect(body).toContain('finance_lessons')
    expect(body.length).toBeGreaterThan(400)
  })

  it('SECURITY DEFINER ama yetki gövdenin İÇİNDE soruluyor', () => {
    expect(body).toContain('SECURITY DEFINER')
    expect(body).toMatch(/has_workspace_role\(v_workspace/)
    expect(body).toMatch(/is_parent_of_student\(p_student_id\)/)
    expect(body).toContain('RAISE EXCEPTION')
  })

  it('search_path sabitlenmiş', () => {
    expect(body).toMatch(/SET search_path = public, pg_temp/)
  })

  it('TUTAR DÖNDÜRMÜYOR — yalnız üç durumdan biri', () => {
    // Dönüş tipi TEXT; bir gün BIGINT'e dönerse veli rakamı görür.
    expect(SQL).toMatch(/FUNCTION public\.student_month_payment_state\([^)]*\)\s*RETURNS TEXT/)
    const returns = [...body.matchAll(/RETURN ([^;]+);/g)].map((m) => m[1].trim())
    for (const r of returns) {
      expect(["'pending'", "'paid'", "'partial'", 'NULL']).toContain(r)
    }
  })

  it('tek öğrenciye kilitli', () => {
    // Öğrenci parametresi olmayan bir sorgu, yetkisi olan bir ayın
    // bütün öğrencilerini döndürürdü.
    const selects = [...body.matchAll(/WHERE student_id = ([^\s]+)/g)].map((m) => m[1])
    expect(selects.length).toBeGreaterThanOrEqual(2)
    for (const s of selects) expect(s).toBe('p_student_id')
  })
})

describe('ay durumu eşikleri · SQL ↔ TypeScript', () => {
  // SQL gövdesindeki sıralamayı okuyup aynı girdilerle TS'i çalıştırmak
  // yerine, iki tarafın da AYNI sıralamayı yazdığını sabitliyoruz:
  // tahakkuk yok → null, tahsilat yok → pending, tahsilat >= tahakkuk
  // → paid, aksi → partial.
  const block = (() => {
    const b = SQL.indexOf('-- PARITY-BEGIN payment_state')
    const e = SQL.indexOf('-- PARITY-END payment_state')
    expect(b).toBeGreaterThan(-1)
    expect(e).toBeGreaterThan(b)
    return SQL.slice(b, e)
  })()

  it('tahakkuk yoksa iki tarafta da durum yok', () => {
    expect(block).toMatch(/v_accrued <= 0[\s\S]*?RETURN NULL/)
    expect(monthPaymentState({ accruedKurus: 0, collectedKurus: 900000 })).toBeNull()
  })

  it('tahsilat yoksa iki tarafta da bekliyor', () => {
    expect(block).toMatch(/v_collected <= 0[\s\S]*?RETURN 'pending'/)
    expect(monthPaymentState({ accruedKurus: 900000, collectedKurus: 0 })).toBe('pending')
  })

  it('tahsilat tahakkuka eşit veya fazlaysa iki tarafta da ödendi', () => {
    expect(block).toMatch(/v_collected >= v_accrued[\s\S]*?RETURN 'paid'/)
    expect(monthPaymentState({ accruedKurus: 900000, collectedKurus: 900000 })).toBe('paid')
    expect(monthPaymentState({ accruedKurus: 900000, collectedKurus: 1000000 })).toBe('paid')
  })

  it('arada kalan iki tarafta da kısmi', () => {
    expect(block).toMatch(/RETURN 'partial'/)
    expect(monthPaymentState({ accruedKurus: 900000, collectedKurus: 100000 })).toBe('partial')
  })

  it('iki taraf da AYNI ay penceresini kullanıyor', () => {
    expect(block).toMatch(/date_trunc\('month', lesson_date\)/)
    expect(block).toMatch(/date_trunc\('month', paid_on\)/)
  })
})

describe('parent_payment_notices · tablo', () => {
  it('TUTAR ALANI YOK — bildirim para kaydı değil', () => {
    const table = SQL.slice(
      SQL.indexOf('CREATE TABLE IF NOT EXISTS public.parent_payment_notices'),
      SQL.indexOf('CREATE INDEX IF NOT EXISTS idx_payment_notices_student')
    )
    expect(table).not.toMatch(/amount_kurus/)
  })

  it('RLS açık', () => {
    expect(SQL).toMatch(/ALTER TABLE public\.parent_payment_notices ENABLE ROW LEVEL SECURITY/)
    expect(SQL).toMatch(/REVOKE ALL ON public\.parent_payment_notices FROM anon/)
  })

  it('veli YALNIZ OKUR — yazma RPC üzerinden', () => {
    // Veliye FOR ALL verilseydi status'ü doğrudan 'confirmed'
    // yapabilirdi.
    const policy = SQL.slice(
      SQL.indexOf('CREATE POLICY payment_notices_parent_read'),
      SQL.indexOf('REVOKE ALL ON public.parent_payment_notices')
    )
    expect(policy).toMatch(/FOR SELECT/)
    expect(policy).not.toMatch(/WITH CHECK/)
  })

  it('aynı ay için tek AÇIK bildirim', () => {
    expect(SQL).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_notice_open/)
    expect(SQL).toMatch(/ON public\.parent_payment_notices \(student_id, month_start\)\s*\n\s*WHERE status = 'pending'/)
  })
})

describe('create_payment_notice · veli', () => {
  const body = fnBody('create_payment_notice')

  it('yalnız bağlı veli gönderebiliyor', () => {
    expect(body).toMatch(/NOT public\.is_parent_of_student\(p_student_id\)/)
    expect(body).toContain('RAISE EXCEPTION')
  })

  it('ay her zaman ayın ilk gününe çekiliyor', () => {
    // 15'i ile 1'i iki ayrı ay gibi görünürse "tek açık bildirim"
    // kuralı delinir.
    expect(body).toMatch(/date_trunc\('month', p_month_start\)/)
  })

  it('gelecek ay bildirilemiyor', () => {
    expect(body).toMatch(/p_month_start > date_trunc\('month', CURRENT_DATE\)/)
  })

  it('ikinci bildirim sessizce yutulmuyor', () => {
    // ON CONFLICT DO NOTHING tek başına bırakılsaydı veli gönderdiğini
    // sanardı.
    expect(body).toMatch(/v_id IS NULL/)
    expect(body).toMatch(/zaten bekleyen bir bildiriminiz var/)
  })
})

describe('resolve_payment_notice · öğretmen', () => {
  const body = fnBody('resolve_payment_notice')

  it('yalnız öğretmen/sahip sonuçlandırabiliyor', () => {
    expect(body).toMatch(/has_workspace_role\(v_notice\.workspace_id, ARRAY\['owner', 'teacher'\]\)/)
  })

  it('tahsilat satırı YALNIZ sahibin elinden çıkıyor (066)', () => {
    // Ders veren öğretmen bildirimi kapatabilir ama parayı deftere
    // yazamaz.
    expect(body).toMatch(/has_workspace_role\(v_notice\.workspace_id, ARRAY\['owner'\]\)/)
  })

  it('tutar isteğe bağlı — verilmezse defter değişmiyor', () => {
    expect(body).toMatch(/p_amount_kurus IS NOT NULL/)
    const inserts = body.match(/INSERT INTO public\.finance_payments/g) ?? []
    expect(inserts.length).toBe(1)
  })

  it('aynı bildirim iki kez sonuçlandırılamıyor', () => {
    // Aksi hâlde her onayda bir tahsilat satırı daha doğardı.
    expect(body).toMatch(/v_notice\.status <> 'pending'/)
  })

  it('geçersiz sonuç ve yöntem reddediliyor', () => {
    expect(body).toMatch(/p_status NOT IN \('confirmed', 'rejected'\)/)
    expect(body).toMatch(/p_method NOT IN \('nakit', 'havale', 'kart', 'diger'\)/)
  })

  it('sıfır veya negatif tutar reddediliyor', () => {
    expect(body).toMatch(/p_amount_kurus <= 0/)
  })
})
