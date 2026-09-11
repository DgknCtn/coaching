import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// OTURUM → TAHAKKUK BAĞI — R7-04 Rev.3 §8, §9
//
// NEDEN BU TEST VAR
//
// 066 finansı ayrı kurdu: yapılan ders `finance_lessons`'a ELLE
// giriliyordu. 074/075 aynı dersi zaten `service_sessions` olarak
// tutuyor. İki defter kaçınılmaz olarak ayrışıyordu ve hangisinin doğru
// olduğunu söyleyecek bir şey yoktu.
//
// 085 bağı kurdu. Bağın üç kuralı var ve üçü de SESSİZCE bozulabilir:
//
//   1. YALNIZ 'ders_basi'. Aylık pakete dahil bir hizmet oturum başına
//      tahakkuk üretirse öğrenci hem paketi hem dersleri borçlanır.
//   2. GERİ ALINABİLİR. "Yapıldı" geri alınınca ya da öğrenci
//      "katılmadı" işaretlenince satır SİLİNMELİ; sadece eklemek,
//      geri alınan dersin borcunu kalıcı kılardı.
//   3. TEK SATIR. Grup fan-out'u ile tekil RPC arka arkaya çalışırsa
//      aynı ders iki kez borç doğurmamalı.
//
// Ayrıca tahakkuk tarihi, 082'nin ay atfı kuralıyla AYNI olmalı: telafi
// asıl aya yazılır. Ayrışırsa "Eylül 4 ders" ile "Eylül 12.000 TL"
// birbirini tutmaz.
//
// Canlı veritabanı olmadan SQL çalıştırılamıyor; migration metnindeki
// koşullar okunuyor (repodaki diğer SQL testleriyle aynı yöntem).
// ============================================================

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/085_session_accrual_and_season.sql'),
  'utf8'
)

const SQL_082 = readFileSync(
  join(process.cwd(), 'supabase/migrations/082_session_month_attribution.sql'),
  'utf8'
)

function fnBody(name: string): string {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  expect(start, `${name} bulunamadı`).toBeGreaterThan(-1)
  const end = SQL.indexOf('$fn$;', start)
  expect(end, `${name} gövdesi kapanmıyor`).toBeGreaterThan(start)
  return SQL.slice(start, end)
}

function parityBlock(sql: string, name: string): string {
  const begin = sql.indexOf(`-- PARITY-BEGIN ${name}`)
  const end = sql.indexOf(`-- PARITY-END ${name}`)
  expect(begin, `${name} PARITY-BEGIN yok`).toBeGreaterThan(-1)
  expect(end, `${name} PARITY-END yok`).toBeGreaterThan(begin)
  return sql.slice(begin, end)
}

describe('sync_session_accrual', () => {
  const body = fnBody('sync_session_accrual')

  it('gövde okunabildi (test boşa geçmesin)', () => {
    expect(body).toContain('finance_lessons')
    expect(body.length).toBeGreaterThan(500)
  })

  it('yalnız ders başı hizmet tahakkuk üretiyor', () => {
    expect(body).toMatch(/finance_link IS DISTINCT FROM 'ders_basi'/)
  })

  it('yalnız YAPILDI oturum tahakkuk üretiyor', () => {
    expect(body).toMatch(/v_ss\.status <> 'yapildi'/)
  })

  it('"katılmadı" işaretli öğrenciye borç yazılmıyor', () => {
    expect(body).toMatch(/v_ss\.attended IS FALSE/)
  })

  it('tahakkuk doğurmayan her durumda satır SİLİNİYOR', () => {
    // Geri alınabilirlik: üç erken çıkışın (finans ilişkisi, durum,
    // ücret yok) hepsi silmeyle bitmeli.
    const deletes = body.match(/DELETE FROM public\.finance_lessons/g) ?? []
    expect(deletes.length).toBeGreaterThanOrEqual(3)
  })

  it('ücret tanımsızsa sıfır TL satır açılmıyor', () => {
    expect(body).toMatch(/v_fee IS NULL/)
    expect(body).toContain('student_fees')
  })

  it('süre 60 dakikalık birime göre ölçekleniyor', () => {
    // 90 dakikalık ders 1,5 birim. quantity tam sayı olduğu için
    // ölçek birim fiyata uygulanıyor.
    expect(body).toMatch(/v_minutes\s*\/\s*60\.0/)
    expect(body).toMatch(/COALESCE\(v_ss\.duration_minutes, v_service\.planned_duration_minutes\)/)
  })

  it('aynı oturum iki kez borç doğurmuyor', () => {
    expect(body).toMatch(/ON CONFLICT \(service_session_id\)/)
    expect(SQL).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_lessons_session/)
  })

  it('elle girilmiş satırlara dokunulmuyor', () => {
    // Her silme service_session_id üzerinden; student_id üzerinden bir
    // silme, 066'dan beri elle girilmiş kayıtları da süpürürdü.
    for (const m of body.matchAll(/DELETE FROM public\.finance_lessons([^;]*);/g)) {
      expect(m[1]).toContain('service_session_id')
      expect(m[1]).not.toMatch(/WHERE student_id/)
    }
  })
})

describe('tahakkuk tarihi · 082 ay atfıyla aynı', () => {
  it('telafi ASIL oturumun ayına yazılıyor', () => {
    const block = parityBlock(SQL, 'accrual_date')
    expect(block).toMatch(/makeup_of_session_id/)
    expect(block).toMatch(/COALESCE\(v_origin, v_ss\.planned_at\)/)
  })

  it('iki kural da aynı yerel takvimi kullanıyor', () => {
    const accrual = parityBlock(SQL, 'accrual_date')
    const month = parityBlock(SQL_082, 'attributed_month')
    expect(accrual).toContain("AT TIME ZONE 'Europe/Istanbul'")
    expect(month).toContain("AT TIME ZONE 'Europe/Istanbul'")
  })

  it('ikisi de asıl oturumun planlanan anını temel alıyor', () => {
    // 082 `asil.planned_at`, 085 onu `v_origin`e okuyor. Biri
    // gerçekleşme anına (actual_at) kayarsa aylar ayrışır.
    expect(parityBlock(SQL_082, 'attributed_month')).toMatch(/asil\.planned_at/)
    expect(parityBlock(SQL, 'accrual_date')).toMatch(/asil\.planned_at/)
  })
})

describe('tetikleyici · her yazma yolunu yakalıyor', () => {
  it('service_sessions üzerinde kurulu', () => {
    expect(SQL).toMatch(/CREATE TRIGGER trg_sync_session_accrual/)
    expect(SQL).toMatch(/ON public\.service_sessions/)
  })

  it('durum ve katılım değişikliklerini izliyor', () => {
    // 075 tekil RPC, 083 grup fan-out'u ve 083 "katılmadı" istisnası
    // hepsi bu iki sütundan biriyle yazıyor.
    expect(SQL).toMatch(/UPDATE OF status, attended/)
  })

  it('silinen oturumun borcu kalmıyor', () => {
    expect(SQL).toMatch(/AFTER INSERT OR DELETE OR/)
    expect(fnBody('tg_sync_session_accrual')).toMatch(/TG_OP = 'DELETE'/)
  })

  it('geçmiş kayıtlar bir kez eşitleniyor', () => {
    // Tetikleyici yalnız bundan sonraki yazmalarda çalışır; geçmiş
    // sessizce eksik kalırdı.
    expect(SQL).toMatch(/DO \$backfill\$/)
    expect(SQL).toMatch(/PERFORM public\.sync_session_accrual\(r\.id\)/)
  })
})

describe('sezon özeti (§9)', () => {
  const view = SQL.slice(
    SQL.indexOf('CREATE OR REPLACE VIEW public.student_season_summary_view'),
    SQL.indexOf('ALTER VIEW public.student_season_summary_view')
  )

  it('sütun listesi değiştiği için view önce düşürülüyor', () => {
    // 075 bu view'ı uzun biçimde kurmuştu; CREATE OR REPLACE sütun
    // listesi değişince başarısız olur ve migration yarıda kalırdı.
    const drop = SQL.indexOf('DROP VIEW IF EXISTS public.student_season_summary_view')
    expect(drop).toBeGreaterThan(-1)
    expect(drop).toBeLessThan(SQL.indexOf('CREATE OR REPLACE VIEW public.student_season_summary_view'))
  })

  it('dokümandaki altı gösterge de var', () => {
    for (const col of [
      'birebir_ders_count',
      'grup_ders_count',
      'kocluk_count',
      'total_count',
      'total_minutes',
      'balance_kurus',
    ]) {
      expect(view).toContain(col)
    }
  })

  it('para YENİDEN toplanmıyor, tek kaynaktan bağlanıyor', () => {
    // 075'in uyarısı: iki yerde toplanan para er geç iki farklı sayıdır.
    expect(view).toMatch(/LEFT JOIN public\.student_finance_view/)
    expect(view).not.toMatch(/SUM\([^)]*kurus/)
  })

  it('yalnız GERÇEKLEŞEN oturum sayılıyor', () => {
    expect(view).toMatch(/ss\.status = 'yapildi'/)
    expect(view).toMatch(/ss\.attended IS DISTINCT FROM FALSE/)
  })

  it('süre boşsa hizmetin planlanan süresi kullanılıyor', () => {
    // 075 yalnız duration_minutes topluyordu; boş bırakılmış her oturum
    // sezon toplamından sessizce düşüyordu.
    expect(view).toMatch(/COALESCE\(ss\.duration_minutes, sv\.planned_duration_minutes\)/)
  })

  it('pencere aktif eğitim dönemi', () => {
    expect(view).toMatch(/academic_terms/)
    expect(view).toMatch(/status = 'active'/)
  })

  it('dönem tarihleri tanımsızsa özet boşalmıyor', () => {
    expect(view).toMatch(/d\.start_date IS NULL/)
    expect(view).toMatch(/d\.end_date IS NULL/)
  })

  it('security_invoker açık — finans RLS delinmiyor', () => {
    expect(SQL).toMatch(
      /ALTER VIEW public\.student_season_summary_view SET \(security_invoker = on\)/
    )
    expect(SQL).toMatch(/REVOKE ALL ON public\.student_season_summary_view FROM anon/)
  })
})

describe('aylık ödeme durumu view', () => {
  it('security_invoker açık ve anon kapalı', () => {
    expect(SQL).toMatch(
      /ALTER VIEW public\.student_month_finance_view SET \(security_invoker = on\)/
    )
    expect(SQL).toMatch(/REVOKE ALL ON public\.student_month_finance_view FROM anon/)
  })

  it('tahakkuk ve tahsilatı olmayan ay da görünüyor', () => {
    // FULL OUTER JOIN: yalnız ödeme yapılmış bir ay ya da yalnız borç
    // doğmuş bir ay tek taraflı kalırsa "Bekliyor" rozeti hiç çıkmaz.
    expect(SQL).toMatch(/FULL OUTER JOIN tahsilat/)
  })
})
