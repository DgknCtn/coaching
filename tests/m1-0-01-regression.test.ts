import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { groupByScope, UNASSIGNED_SCOPE_KEY, type StudentScope } from '@/lib/student-scopes'

// ============================================================
// M1.0-01 · GERÇEK KULLANIMA GEÇİŞ HIZLI REVİZYONLARI
//
// Veri temizliği ve toplu işlem RPC'lerinin davranışı canlı veritabanı
// olmadan çalıştırılamaz; burada migration METNİ okunur ve dokümanın
// "korunacak durum ayrımları" (§6) sabitlenir. Saf fonksiyonlar doğrudan
// test edilir.
// ============================================================

function migration(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase/migrations', name), 'utf8')
}

function fn(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  expect(start, `${name} tanımı bulunamadı`).toBeGreaterThan(-1)
  const end = sql.indexOf('$fn$;', start)
  return sql.slice(start, end === -1 ? undefined : end)
}

const scope = (id: string, name: string, sortOrder = 0): StudentScope => ({
  id,
  name,
  subject: null,
  levelExam: null,
  sortOrder,
})

describe('§1.3 Ders/Kapsam gruplaması', () => {
  it('alanı listede olmayan kaynak kaybolmaz, "Alan atanmamış"a düşer', () => {
    const groups = groupByScope(
      [
        { id: 'a', scopeId: 's1' },
        { id: 'b', scopeId: null },
        { id: 'c', scopeId: 'silinmis-alan' },
      ],
      [scope('s1', 'TYT Matematik')]
    )
    expect(groups.map(g => g.key)).toEqual(['s1', UNASSIGNED_SCOPE_KEY])
    expect(groups[1].items.map(i => i.id)).toEqual(['b', 'c'])
  })

  it('alan değişince kaynak yeni bloğa taşınır (aynı kayıt, yeni scopeId)', () => {
    const scopes = [scope('s1', 'TYT Matematik'), scope('s2', 'AYT Matematik', 1)]
    const before = groupByScope([{ id: 'a', scopeId: null }], scopes)
    const after = groupByScope([{ id: 'a', scopeId: 's1' }], scopes)
    expect(before.find(g => g.key === UNASSIGNED_SCOPE_KEY)?.items).toHaveLength(1)
    expect(after.find(g => g.key === 's1')?.items.map(i => i.id)).toEqual(['a'])
    expect(after.some(g => g.key === UNASSIGNED_SCOPE_KEY)).toBe(false)
  })
})

describe('§1.2 Atanmış kaynak temizliği (133)', () => {
  const sql = migration('133_assignment_cleanup.sql')

  it('kullanım = ödev kalemi VEYA resmi tamamlama', () => {
    const used = sql.slice(sql.indexOf('FUNCTION public.assignment_is_used'))
    expect(used).toMatch(/FROM public\.homework_items/)
    expect(used).toMatch(/FROM public\.test_completions/)
  })

  it('kullanılmış kaynak silinemez', () => {
    const body = fn(sql, 'delete_unused_assignment')
    expect(body).toMatch(/IF public\.assignment_is_used\(p_assignment_id\) THEN\s+RAISE EXCEPTION/)
    expect(body.indexOf('assignment_is_used')).toBeLessThan(body.indexOf('DELETE FROM'))
  })

  it('arşiv yalnız AÇIK kalemleri iptal eder; tamamlananlar ve test_completions kalır', () => {
    const body = fn(sql, 'archive_assignment')
    expect(body).toMatch(/SET status = 'cancelled'/)
    expect(body).toMatch(/status IN \('pending', 'pending_approval'\)/)
    expect(body).not.toMatch(/DELETE FROM/)
    expect(body).not.toMatch(/test_completions/)
  })

  it('her RPC rol denetimi yapar', () => {
    for (const name of ['delete_unused_assignment', 'archive_assignment', 'unarchive_assignment']) {
      expect(fn(sql, name)).toMatch(/has_workspace_role\(v_workspace_id, ARRAY\['owner', 'teacher'\]\)/)
    }
  })
})

describe('§2 Son teslim tarih + saat (132)', () => {
  const sql = migration('132_homework_due_at.sql')

  it('due_date, due_at verildiğinde onun İstanbul gününden türetilir', () => {
    expect(sql).toMatch(
      /COALESCE\(\(p_due_at AT TIME ZONE 'Europe\/Istanbul'\)::DATE, p_due_date\)/
    )
  })

  it('eski imza düşürülür (DEFAULT parametreli aşırı yükleme belirsizliği)', () => {
    expect(sql).toMatch(
      /DROP FUNCTION IF EXISTS public\.create_homework_batch\(UUID, UUID, UUID, DATE, TEXT, TEXT, JSONB\)/
    )
  })
})
