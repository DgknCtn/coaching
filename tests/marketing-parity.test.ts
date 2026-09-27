import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { STATUS_LABEL } from '@/lib/student-status'
import { counterLabel } from '@/lib/homework-status'
import { demoStudents, demoSummary } from '@/components/marketing/demo/demo-students'

// VİTRİN ↔ ÜRÜN PARİTESİ
//
// ============================================================
// NEDEN BU TEST VAR
//
// Landing ve demo, ürünün sözlüğünü ve sayılarını ELLE yazıyordu ve
// ikisi de kaymıştı:
//   - Durum etiketi "İyi / Dikkat / Kritik" — üründe Yolunda / Takip Et /
//     Geride / Müdahale Gerekli.
//   - Hero "%86", demo "%74" — aynı sahne, iki sayı.
//   - İade süresi ve deneme süresi üç yerde elle yazılı.
//
// Hepsi tek kaynağa bağlandı (lib/student-status.ts, lib/homework-status.ts,
// lib/plans.ts, demo-students.ts). Bu test, pazarlama bileşenlerinin
// kaynak metninde eski etiketlerin ya da lib sabitlerinin elle yazılmış
// kopyalarının GERİ GELMESİNİ yakalar.
//
// YORUMLAR TARANMAZ: karar kayıtları eski kelimeleri bilerek anıyor.
// Sayfaya çıkmayan iki dosya (feature-grid, stats-bar) da taranmaz;
// landing-page.tsx neden çıkarıldıklarını kaydediyor.
// ============================================================

const ROOT = join(process.cwd(), 'components/marketing')
const SKIP = new Set(['feature-grid.tsx', 'stats-bar.tsx'])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !SKIP.has(name) ? [path] : []
  })
}

/** Yorumları atar: `//` satırları, `/* *\/` ve JSX içindeki `{/* *\/}` blokları. */
function withoutComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bKritik\b/, why: "eski durum etiketi — STATUS_LABEL kullan" },
  { pattern: /['"`>]\s*İyi\s*['"`<]/, why: "eski durum etiketi — STATUS_LABEL kullan" },
  { pattern: /['"`>]\s*Dikkat\s*['"`<]/, why: "eski durum etiketi — STATUS_LABEL kullan" },
  { pattern: /\b14 gün/, why: 'iade süresi elle yazılmış — REFUND_DAYS kullan' },
  { pattern: /\b\d+ gün ücretsiz/i, why: 'deneme süresi elle yazılmış — TRIAL_DAYS kullan' },
  { pattern: /\d+\+ öğrenci/, why: 'öğrenci aralığı elle yazılmış — MAX_SELF_SERVICE_STUDENTS kullan' },
]

describe('vitrin ↔ ürün paritesi', () => {
  const files = sourceFiles(ROOT).map(path => ({
    name: relative(process.cwd(), path),
    code: withoutComments(readFileSync(path, 'utf-8')),
  }))

  it('pazarlama dosyaları bulundu (boş tarama hiçbir şey kanıtlamaz)', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  for (const { pattern, why } of FORBIDDEN) {
    it(`${pattern} yok (${why})`, () => {
      const hits = files.filter(f => pattern.test(f.code)).map(f => f.name)
      expect(hits).toEqual([])
    })
  }

  it('demo öğrencilerinin durumu ürünün sözlüğünden', () => {
    for (const s of demoStudents) {
      expect(Object.keys(STATUS_LABEL)).toContain(s.status)
      // "Yolunda" değilse bir gerekçesi olmalı — üründe de öyle.
      if (s.status !== 'yolunda') expect(s.signals.length).toBeGreaterThan(0)
    }
  })

  it('sahne özeti listeden türüyor', () => {
    const summary = demoSummary()
    expect(summary.students).toBe(demoStudents.length)
    expect(summary.overdue).toBe(demoStudents.reduce((n, s) => n + s.overdue, 0))
    expect(summary.needsAttention).toBe(demoStudents.filter(s => s.status !== 'yolunda').length)
  })

  it('sayaç sözlüğü teslim ile onayı ayırıyor', () => {
    expect(counterLabel('delivered')).not.toBe(counterLabel('completed'))
  })
})
