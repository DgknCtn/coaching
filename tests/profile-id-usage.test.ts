import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// auth.uid() BİR PROFİL KİMLİĞİ DEĞİLDİR
//
// NEDEN BU TEST VAR
//
// 077:189 akışı açan kişiyi `auth.uid()` ile yazıyordu, oysa
// `weekly_flows.created_by_profile_id` sütunu `profiles(id)`'ye
// referans veriyor. İkisi farklı sütundur:
//
//   profiles.id           -> tablonun birincil anahtarı
//   profiles.auth_user_id -> auth.uid()'nin karşılığı
//
// Sonuç: "Haftalık akışı aç" HER ZAMAN yabancı anahtar hatası veriyordu
// ve kullanıcı yalnız genel "İşlem tamamlanamadı" mesajını görüyordu.
//
// Hata ne tip kontrolüyle ne de mevcut testlerle yakalanabilirdi: RPC
// gövdesi SQL, TypeScript yalnız çağırıyor ve CI'da canlı veritabanı
// yok. Ancak gerçek bir öğrencide akış açılmaya çalışılınca ortaya
// çıktı — yani özelliğin kendisi teslim edilmiş ama hiç çalışmamıştı.
//
// KURAL: `auth.uid()` yalnızca `auth_user_id` ile KARŞILAŞTIRILABİLİR.
// Bir sütuna DEĞER olarak yazılamaz. Depodaki bütün meşru kullanımlar
// (002, 003, 024, 051, 057-060, 064, 069) zaten bu biçimde; bir profil
// kimliği gerektiğinde doğru yardımcı `public.current_profile_id()`.
// ============================================================

const DIR = join(process.cwd(), 'supabase/migrations')

/**
 * Hatanın kendisini taşıyan dosya.
 *
 * 077 ÇALIŞTIRILMIŞ bir migration; metni artık bir kayıttır ve geriye
 * dönük düzeltilmez (aksi hâlde veritabanında olan ile depoda yazan
 * arasındaki tek bağ kopar). Düzeltme 078'de `CREATE OR REPLACE` ile
 * geliyor. İstisna dosya adına bağlı, satır numarasına değil: satır
 * numarası kaysa bile kural çalışmaya devam etmeli.
 */
const SUPERSEDED_FILE = '077_weekly_flows.sql'
const SUPERSEDED_COUNT = 1

interface Hit {
  file: string
  line: number
  text: string
}

function offendingLines(): Hit[] {
  const hits: Hit[] = []
  for (const file of readdirSync(DIR).filter(f => f.endsWith('.sql'))) {
    const lines = readFileSync(join(DIR, file), 'utf8').split(/\r?\n/)
    lines.forEach((raw, i) => {
      const text = raw.trim()
      if (!text.includes('auth.uid()')) return
      // Yorum satırı: kuralı anlatan metinler de "auth.uid()" içeriyor.
      if (text.startsWith('--')) return
      // Meşru kullanım: auth_user_id ile karşılaştırma
      // (`p_auth_user_id` de bu kalıba girer).
      if (text.includes('auth_user_id')) return
      hits.push({ file, line: i + 1, text })
    })
  }
  return hits
}

describe('auth.uid() yalnız auth_user_id ile karşılaştırılır', () => {
  it('tarama gerçekten bir şey buluyor (test boşa geçmesin)', () => {
    // pricing-sql-parity.test.ts'teki koruma ile aynı gerekçe: regex
    // hiçbir şey bulamazsa test sessizce geçer ve hiçbir şeyi
    // korumaz hâle gelir.
    const all = readdirSync(DIR).filter(f => f.endsWith('.sql'))
    expect(all.length).toBeGreaterThan(70)
    const withAuthUid = all.filter(f =>
      readFileSync(join(DIR, f), 'utf8').includes('auth.uid()')
    )
    expect(withAuthUid.length).toBeGreaterThan(5)
  })

  it('hiçbir migration auth.uid()\'yi bir sütuna DEĞER olarak yazmaz', () => {
    const unexpected = offendingLines().filter(h => h.file !== SUPERSEDED_FILE)
    expect(
      unexpected,
      unexpected
        .map(h => `${h.file}:${h.line} -> ${h.text}`)
        .join('\n') +
        '\n\nBir profil kimliği gerekiyorsa public.current_profile_id() kullanın.'
    ).toEqual([])
  })

  it('bilinen tek istisna 077 ve sayısı artmamış', () => {
    // İstisna genişlerse aynı hata sessizce çoğalmış demektir.
    const known = offendingLines().filter(h => h.file === SUPERSEDED_FILE)
    expect(known).toHaveLength(SUPERSEDED_COUNT)
  })
})

describe('078 düzeltmesi yerinde duruyor', () => {
  const fix = readFileSync(join(DIR, '078_weekly_flow_author_fix.sql'), 'utf8')

  it('open_weekly_flow yeniden tanımlanıyor', () => {
    expect(fix).toContain('CREATE OR REPLACE FUNCTION public.open_weekly_flow')
  })

  it('yazar current_profile_id() ile alınıyor', () => {
    expect(fix).toContain('public.current_profile_id()')
    // Düzeltme dosyasının kendisi hatayı tekrar etmemeli.
    const body = fix
      .split(/\r?\n/)
      .filter(l => !l.trim().startsWith('--'))
      .join('\n')
    expect(body).not.toContain('auth.uid()')
  })

  it('yetki grant\'ları korunuyor', () => {
    // CREATE OR REPLACE yetkileri sıfırlamaz ama imza değişirse yeni
    // fonksiyon doğar; grant satırları o durumda tek güvencedir.
    expect(fix).toContain('GRANT EXECUTE ON FUNCTION public.open_weekly_flow')
    expect(fix).toContain('REVOKE ALL ON FUNCTION public.open_weekly_flow')
  })
})
