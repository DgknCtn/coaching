import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// DENEME/LİSANS KAPISI — İKİ YOL, TEK CEVAP (107)
//
// ============================================================
// NEDEN BU TEST VAR
//
// 091 kendi başlığında sözleşmeyi yazmıştı:
//
//   "has_workspace_role ile AYNI KOŞULLAR ... Biri değişirse diğeri de
//    değişmeli — ayrışırlarsa aynı soruya iki farklı cevap veren iki
//    yol oluşur."
//
// 092 o cümleyi yalanladı. Politikalar mekanik olarak
// `has_workspace_role` yerine `my_workspace_ids` çağırmaya başladı ama
// ikinci fonksiyon `workspace_access_ok`'u çağırmıyordu. Sonuç: 75
// politikada deneme/lisans kapısı sessizce düştü. Süresi dolmuş bir
// kiracı kendi workspaces satırını göremezken öğrenci, ödev ve finans
// verisini görebiliyordu.
//
// Hiçbir test kırılmadı, hiçbir ekran bozulmadı. Yetki gerilemeleri
// gürültü çıkarmaz — bu yüzden gürültüyü test yapar.
//
// NE TEST EDER: migration ağacındaki GÜNCEL tanımlar. Canlı veritabanı
// erişimi gerektirmez, her koşuda çalışır.
//
// NE TEST ETMEZ: canlının migration'larla aynı olduğunu. O, Faz 0'daki
// salt okunur denetimin işi (docs/production-readiness/baseline.md).
// ============================================================

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations')

/** Bir fonksiyonun EN SON tanımlandığı dosyadaki gövdesi. */
function latestDefinition(functionName: string): { file: string; body: string } {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  let found: { file: string; body: string } | null = null

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    // Yorum satırları elenir: örnek SQL'ler ve ROLLBACK blokları yorumda yaşıyor.
    const code = sql
      .split(/\r?\n/)
      .filter(line => !line.trimStart().startsWith('--'))
      .join('\n')

    const pattern = new RegExp(
      `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${functionName}\\s*\\(`,
      'gi'
    )
    let match: RegExpExecArray | null
    while ((match = pattern.exec(code)) !== null) {
      // Gövde: tanımın başından sonraki `$$;` ya da `$fn$;` kapanışına kadar.
      const rest = code.slice(match.index)
      const end = rest.search(/\$(?:fn)?\$\s*;/)
      found = { file, body: end === -1 ? rest : rest.slice(0, end) }
    }
  }

  if (!found) throw new Error(`${functionName} tanımı bulunamadı`)
  return found
}

describe('deneme/lisans kapısı · iki yol tek cevap', () => {
  it('my_workspace_ids erişim kapısını çağırır', () => {
    // 107'nin kendisi. Bu satır düşerse 092'nin gerilemesi geri gelir.
    const { body, file } = latestDefinition('my_workspace_ids')
    expect(
      body,
      `my_workspace_ids (${file}) workspace_access_ok çağırmıyor — ` +
        'deneme/lisans kapısı 75 politikadan düşmüş demektir.'
    ).toContain('workspace_access_ok')
  })

  it('has_workspace_role aynı kapıyı çağırmaya devam eder', () => {
    // Kapının diğer ucu. İkisinden biri kapıyı bırakırsa ayrışma başlar.
    const { body, file } = latestDefinition('has_workspace_role')
    expect(
      body,
      `has_workspace_role (${file}) workspace_access_ok çağırmıyor.`
    ).toContain('workspace_access_ok')
  })

  it('iki yol da üyeliği aynı koşullarla arar', () => {
    // Kapı aynı olsa bile üyelik koşulu ayrışırsa yine iki cevap doğar.
    //
    // BOŞLUK NORMALLEŞTİRİLİR: tanımlarda sütunlar hizalanmak için
    // fazladan boşluk taşıyor (`wm.status     = 'active'`). Anlam
    // taşımayan bir biçim farkına testin kırılması, gerçek bir
    // ayrışmayı yakalamasından daha sık olurdu — ve sürekli kırmızı
    // bir test görmezden gelinir.
    const squeeze = (s: string) => s.replace(/\s+/g, ' ')

    const gate = squeeze(latestDefinition('my_workspace_ids').body)
    const role = squeeze(latestDefinition('has_workspace_role').body)

    for (const predicate of ["status = 'active'", 'current_profile_id()']) {
      expect(gate, `my_workspace_ids: ${predicate} eksik`).toContain(predicate)
      expect(role, `has_workspace_role: ${predicate} eksik`).toContain(predicate)
    }
  })

  it('kapısız ikiz YALNIZ ticari tablolarda kullanılır', () => {
    // `my_member_workspace_ids` bilerek kapısız (süresi dolmuş kiracı
    // yenileme yapabilmeli). Ama başka bir yere sızarsa, kapıyı
    // sessizce delen bir arka kapı olur.
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()

    const IZINLI_TABLOLAR = ['billing_orders', 'workspace_licenses']
    const ihlaller: string[] = []

    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
      const code = sql
        .split(/\r?\n/)
        .filter(line => !line.trimStart().startsWith('--'))
        .join('\n')

      // Politika blokları: CREATE POLICY ... ; arası.
      for (const block of code.split(/CREATE\s+POLICY/i).slice(1)) {
        const body = block.split(';')[0]
        if (!body.includes('my_member_workspace_ids')) continue
        if (!IZINLI_TABLOLAR.some(t => body.includes(t))) {
          ihlaller.push(`${file}: ${body.split('\n')[0].trim()}`)
        }
      }
    }

    expect(
      ihlaller,
      `Kapısız ikiz ticari tablolar dışında kullanılmış: ${ihlaller.join(' | ')}`
    ).toEqual([])
  })
})
