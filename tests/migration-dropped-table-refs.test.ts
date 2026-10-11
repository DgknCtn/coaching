import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// SİLİNEN TABLOYU OKUYAN FONKSİYON
//
// NEDEN BU TEST VAR
//
// 138 `student_login_codes`'u silip `member_login_codes`'a taşıdı; 124'teki
// `admin_system_status` eski tabloyu okumaya devam etti. plpgsql gövdesi
// çağrı anında derlendiği için migration HATASIZ uygulandı ve hata ancak
// yönetim panelinde "Sistem durumu alınamadı" olarak göründü (142 düzeltti).
//
// KURAL: bir migration bir tabloyu düşürüyorsa, o tabloyu gövdesinde anan
// her fonksiyonun EN SON tanımı, düşürmeden SONRA (ya da aynı dosyada
// düşürmeden sonra) yazılmış olmalı — yani yeniden tanımlanıp eski
// tablodan kurtarılmış olmalı. Ya da fonksiyon kendisi düşürülmüş olmalı.
// ============================================================

const DIR = join(process.cwd(), 'supabase/migrations')

const files = readdirSync(DIR)
  .filter((f) => /^\d{3}_.*\.sql$/.test(f))
  .sort()
  .map((name) => ({
    name,
    sql: readFileSync(join(DIR, name), 'utf8')
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n'),
  }))

/** Bir dosya içi konumu tüm migration dizisinde sıralanabilir kılar. */
type Pos = { file: number; offset: number }
const before = (a: Pos, b: Pos) => a.file < b.file || (a.file === b.file && a.offset < b.offset)

const drops: { table: string; at: Pos }[] = []
const defs = new Map<string, { at: Pos; body: string }>()
const fnDrops = new Map<string, Pos>()

files.forEach((f, i) => {
  for (const m of f.sql.matchAll(/DROP TABLE IF EXISTS public\.(\w+)/g)) {
    drops.push({ table: m[1], at: { file: i, offset: m.index! } })
  }
  for (const m of f.sql.matchAll(/DROP FUNCTION IF EXISTS public\.(\w+)/g)) {
    fnDrops.set(m[1], { file: i, offset: m.index! })
  }
  const re = /CREATE OR REPLACE FUNCTION public\.(\w+)\s*\([\s\S]*?\$(\w*)\$([\s\S]*?)\$\2\$/g
  for (const m of f.sql.matchAll(re)) {
    defs.set(m[1], { at: { file: i, offset: m.index! }, body: m[3] })
  }
})

describe('silinen tabloyu okuyan fonksiyon kalmadı', () => {
  it('düşürülen tablo bulundu (test boşa geçmesin)', () => {
    expect(drops.some((d) => d.table === 'student_login_codes')).toBe(true)
  })

  it('hiçbir fonksiyonun son tanımı, sonradan düşürülen bir tabloyu okumuyor', () => {
    const stale: string[] = []
    for (const [fn, def] of defs) {
      const dropped = fnDrops.get(fn)
      if (dropped && before(def.at, dropped)) continue
      for (const d of drops) {
        if (!before(def.at, d.at)) continue
        // Tablo daha sonra aynı adla yeniden kurulduysa sorun yok.
        const recreated = files.some(
          (f, i) =>
            (i > d.at.file || (i === d.at.file)) &&
            new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${d.table}\\b`).test(f.sql.slice(i === d.at.file ? d.at.offset : 0))
        )
        if (recreated) continue
        if (new RegExp(`\\bpublic\\.${d.table}\\b|\\bFROM\\s+${d.table}\\b|\\bJOIN\\s+${d.table}\\b`).test(def.body)) {
          stale.push(`${fn} (${files[def.at.file].name}) → ${d.table} (${files[d.at.file].name}'de düşürüldü)`)
        }
      }
    }
    expect(stale).toEqual([])
  })
})
