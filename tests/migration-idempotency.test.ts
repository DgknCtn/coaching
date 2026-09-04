import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// MIGRATION YENİDEN ÇALIŞTIRILABİLİRLİĞİ.
//
// ============================================================
// NEDEN BU TEST VAR
//
// Supabase SQL düzenleyicisi betiği TEK İŞLEM OLARAK SARMALAMIYOR. Bir
// ifade patladığında öncekiler UYGULANMIŞ olarak kalır ve migration
// yarıda asılı kalır. Tek makul kurtarma yolu dosyayı baştan tekrar
// çalıştırmak — ama bu ancak her ifade yeniden çalıştırılabilirse
// mümkün.
//
// Bu ders iki kez ısırdı: önce `get_workspace_access_state` dönüş tipi
// değiştiği için (DROP gerekiyordu), sonra `workspace_licenses_status_check`
// yalnız ESKİ adıyla düşürüldüğü için ("already exists"). İkisi de göz
// kararı denetlemenin yetmediğini gösterdi.
//
// KAPSAM 058 VE SONRASI: daha eski dosyalar bu kural konmadan önce
// yazıldı ve çoktan uygulandı; onları şimdi değiştirmek uygulanmış bir
// geçmişi kurcalamak olurdu.
// ============================================================

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations')
const FIRST_ENFORCED = 58

function enforcedMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => {
      const n = Number.parseInt(f.slice(0, 3), 10)
      return Number.isFinite(n) && n >= FIRST_ENFORCED
    })
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8'),
    }))
}

/** Yorum satırlarını atar — örnek SQL'ler yorum içinde yaşıyor. */
function withoutComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
}

describe('migration yeniden çalıştırılabilirliği', () => {
  const files = enforcedMigrations()

  it('denetlenecek dosya bulundu', () => {
    // Dosya adlandırması değişirse test sessizce boş geçmesin.
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map((f) => f.name))('%s · CREATE TABLE IF NOT EXISTS kullanır', (name) => {
    const sql = withoutComments(files.find((f) => f.name === name)!.sql)
    const bad = [...sql.matchAll(/CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/gi)]
    expect(bad.map(() => 'CREATE TABLE (IF NOT EXISTS yok)')).toEqual([])
  })

  it.each(files.map((f) => f.name))('%s · CREATE INDEX IF NOT EXISTS kullanır', (name) => {
    const sql = withoutComments(files.find((f) => f.name === name)!.sql)
    const bad = [...sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)/gi)]
    expect(bad.map(() => 'CREATE INDEX (IF NOT EXISTS yok)')).toEqual([])
  })

  it.each(files.map((f) => f.name))('%s · ADD COLUMN IF NOT EXISTS kullanır', (name) => {
    const sql = withoutComments(files.find((f) => f.name === name)!.sql)
    const bad = [...sql.matchAll(/ADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)/gi)]
    expect(bad.map(() => 'ADD COLUMN (IF NOT EXISTS yok)')).toEqual([])
  })

  it.each(files.map((f) => f.name))(
    '%s · her ADD CONSTRAINT için AYNI ADI düşüren bir DROP var',
    (name) => {
      // Bu testin asıl sebebi: workspace_licenses_status_check yalnız
      // ESKİ adıyla düşürülüyordu, migration ikinci kez çalıştırılamıyordu.
      const sql = withoutComments(files.find((f) => f.name === name)!.sql)

      const added = [...sql.matchAll(/ADD\s+CONSTRAINT\s+([a-z0-9_]+)/gi)].map((m) => m[1])
      const dropped = new Set(
        [...sql.matchAll(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+([a-z0-9_]+)/gi)].map((m) => m[1])
      )

      const missing = added.filter((c) => !dropped.has(c))
      expect(missing, `DROP CONSTRAINT IF EXISTS eksik: ${missing.join(', ')}`).toEqual([])
    }
  )

  it.each(files.map((f) => f.name))(
    '%s · her CREATE POLICY için aynı adı düşüren bir DROP var',
    (name) => {
      const sql = withoutComments(files.find((f) => f.name === name)!.sql)

      const created = [...sql.matchAll(/CREATE\s+POLICY\s+([a-z0-9_]+)/gi)].map((m) => m[1])
      const dropped = new Set(
        [...sql.matchAll(/DROP\s+POLICY\s+IF\s+EXISTS\s+([a-z0-9_]+)/gi)].map((m) => m[1])
      )

      const missing = created.filter((c) => !dropped.has(c))
      expect(missing, `DROP POLICY IF EXISTS eksik: ${missing.join(', ')}`).toEqual([])
    }
  )

  it.each(files.map((f) => f.name))(
    '%s · her CREATE TRIGGER için aynı adı düşüren bir DROP var',
    (name) => {
      const sql = withoutComments(files.find((f) => f.name === name)!.sql)

      const created = [...sql.matchAll(/CREATE\s+TRIGGER\s+([a-z0-9_]+)/gi)].map((m) => m[1])
      const dropped = new Set(
        [...sql.matchAll(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+([a-z0-9_]+)/gi)].map((m) => m[1])
      )

      const missing = created.filter((c) => !dropped.has(c))
      expect(missing, `DROP TRIGGER IF EXISTS eksik: ${missing.join(', ')}`).toEqual([])
    }
  )

  it.each(files.map((f) => f.name))(
    '%s · OR REPLACE olmayan CREATE FUNCTION öncesinde DROP var',
    (name) => {
      // `CREATE OR REPLACE` dönüş tipini değiştiremez; şekil değişen bir
      // fonksiyon DROP+CREATE gerektirir. O kalıbı kullanan yerde DROP
      // gerçekten yazılmış olmalı.
      const sql = withoutComments(files.find((f) => f.name === name)!.sql)

      const plainCreates = [
        ...sql.matchAll(/CREATE\s+FUNCTION\s+public\.([a-z0-9_]+)/gi),
      ].map((m) => m[1])

      const dropped = new Set(
        [...sql.matchAll(/DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.([a-z0-9_]+)/gi)].map(
          (m) => m[1]
        )
      )

      const missing = plainCreates.filter((f) => !dropped.has(f))
      expect(missing, `DROP FUNCTION IF EXISTS eksik: ${missing.join(', ')}`).toEqual([])
    }
  )
})
