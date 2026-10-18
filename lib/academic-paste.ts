// TOPLU YAPIŞTIR — API/LLM OLMADAN (M1.0-03 §4).
//
// Standart satır biçimi deterministik okunur; token, kota, maliyet yok:
//
//   11. Sınıf Fizik | Süre | 120 dk
//   11. Sınıf Kimya | Görev | Yazılı kapsamını tekrar et
//   AYT Geometri | Görev | Tüm formülleri çıkar | Tarihsiz
//
//   1. alan  öğrencinin aktif Ders Havuzuyla eşleşir
//   2. alan  Görev / Checklist / Süre
//   3. alan  metin (süre satırında dakika); checklist'te maddeler "/" ile
//   4. alan  "Tarihsiz" → plan son tesliminden ayrılır
//
// Tanımlanamayan ders veya tür önizlemede HATA olarak işaretlenir; diğer
// satırlar kaybolmaz. Serbest doğal dil V1 kapsamı dışında.

import type { AcademicTaskKind } from '@/lib/academic-tasks'

export interface PasteCourse {
  id: string
  name: string
}

export type PasteRow =
  | {
      ok: true
      line: number
      raw: string
      scopeId: string
      scopeName: string
      kind: AcademicTaskKind
      title: string
      targetMinutes: number | null
      checklist: string[]
      undated: boolean
    }
  | { ok: false; line: number; raw: string; error: string }

/** Türkçe büyük/küçük harf ve aksan farkını yok sayan anahtar. */
export function courseKey(name: string): string {
  return name
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const KIND_ALIASES: Record<string, AcademicTaskKind> = {
  gorev: 'gorev',
  odev: 'gorev',
  checklist: 'checklist',
  liste: 'checklist',
  kontrol: 'checklist',
  sure: 'sure',
  'sure hedefi': 'sure',
  dakika: 'sure',
}

function parseKind(field: string): AcademicTaskKind | null {
  return KIND_ALIASES[courseKey(field)] ?? null
}

function parseMinutes(field: string): number | null {
  const m = /^(\d{1,4})\s*(?:dk|dakika|dak)?\.?$/iu.exec(field.trim())
  if (!m) return null
  const n = Number(m[1])
  return n > 0 && n <= 6000 ? n : null
}

export function parsePaste(text: string, courses: PasteCourse[]): PasteRow[] {
  const byKey = new Map(courses.map((c) => [courseKey(c.name), c]))
  const rows: PasteRow[] = []
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const raw = rawLine.trim()
    if (!raw) return
    const line = i + 1
    const fields = raw.split('|').map((f) => f.trim())
    if (fields.length < 3) {
      rows.push({ ok: false, line, raw, error: 'Biçim: Ders | Tür | Metin' })
      return
    }
    const course = byKey.get(courseKey(fields[0]))
    if (!course) {
      rows.push({ ok: false, line, raw, error: `"${fields[0]}" öğrencinin aktif dersleri arasında değil` })
      return
    }
    const kind = parseKind(fields[1])
    if (!kind) {
      rows.push({ ok: false, line, raw, error: `"${fields[1]}" tanınmayan tür (Görev / Checklist / Süre)` })
      return
    }
    const extras = fields.slice(3).map(courseKey)
    const undated = extras.includes('tarihsiz')

    if (kind === 'sure') {
      const minutes = parseMinutes(fields[2])
      if (!minutes) {
        rows.push({ ok: false, line, raw, error: 'Süre satırında dakika girin (ör. 120 dk)' })
        return
      }
      rows.push({
        ok: true,
        line,
        raw,
        scopeId: course.id,
        scopeName: course.name,
        kind,
        title: `Bu hafta ${minutes} dk`,
        targetMinutes: minutes,
        checklist: [],
        undated,
      })
      return
    }

    if (!fields[2]) {
      rows.push({ ok: false, line, raw, error: 'Görev metni boş' })
      return
    }

    if (kind === 'checklist') {
      const [head, ...rest] = fields[2].split(':')
      const items = (rest.length ? rest.join(':') : head)
        .split('/')
        .map((x) => x.trim())
        .filter(Boolean)
      rows.push({
        ok: true,
        line,
        raw,
        scopeId: course.id,
        scopeName: course.name,
        kind,
        title: rest.length ? head.trim() : fields[2],
        targetMinutes: null,
        checklist: items,
        undated,
      })
      return
    }

    rows.push({
      ok: true,
      line,
      raw,
      scopeId: course.id,
      scopeName: course.name,
      kind,
      title: fields[2],
      targetMinutes: null,
      checklist: [],
      undated,
    })
  })
  return rows
}
