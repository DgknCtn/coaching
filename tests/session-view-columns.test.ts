import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { SESSION_SELECT } from '@/app/(dashboard)/teacher/students/[studentId]/gorusmeler/load'

// ============================================================
// SESSION_SELECT ⊆ student_service_session_view
//
// Oturum ekranları (koç geneli Ders & Görüşmeler, öğrencinin haftalık ve
// aylık görünümü) SESSION_SELECT'i bu görünüm üzerinden okur. Görünümde
// olmayan bir sütun eklenirse PostgREST sorguyu reddeder ve ekranlar
// HATA VERMEDEN boş kalır — 157'de calendar_state ile tam olarak bu oldu.
// Görünümün son tanımı migration'lardan okunur.
// ============================================================

function viewColumns(): Set<string> {
  const dir = join(process.cwd(), 'supabase/migrations')
  let body = ''
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8')
    const at = sql.lastIndexOf('VIEW public.student_service_session_view')
    if (at === -1) continue
    const select = sql.indexOf('SELECT', at)
    body = sql.slice(select + 'SELECT'.length, sql.indexOf('FROM public.service_sessions', select))
  }
  const cols = new Set<string>()
  for (const raw of body.replace(/--[^\n]*/g, '').split(/,(?![^(]*\))/)) {
    const expr = raw.trim()
    if (!expr) continue
    const alias = expr.match(/\bAS\s+([a-z_]+)\s*$/i)
    cols.add(alias ? alias[1] : expr.split('.').pop()!.trim())
  }
  return cols
}

describe('oturum görünümü sütunları', () => {
  it('SESSION_SELECT yalnız görünümde var olan sütunları ister', () => {
    const cols = viewColumns()
    expect(cols.has('current_planned_at')).toBe(true)
    const missing = SESSION_SELECT.split(',').map(c => c.trim()).filter(c => !cols.has(c))
    expect(missing).toEqual([])
  })
})
