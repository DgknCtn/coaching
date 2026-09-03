// Kitap havuzu yedeği (R4 §8).
//
// 100-120 kitaplık havuz bir kez emek verilerek kurulacağı için kayıtların
// kaybolmaması kritik kabul edilir. Bu uç nokta kitaplar + bölümler +
// testleri Supabase dışına indirilebilir tek bir dosyaya çıkarır.
// İçe aktarma bilinçli olarak kapsam dışı: önce güvenli export yeterlidir.

import { NextRequest, NextResponse } from 'next/server'
import { getTeacherContext } from '@/lib/workspace'

export const dynamic = 'force-dynamic'

interface ExportSection {
  id: string
  title: string
  order_index: number
  note: string | null
  video_url: string | null
  /** R7-03: alt bölüm hiyerarşisi ve basılı test aralığı. */
  parent_section_id: string | null
  test_start: number | null
  test_end: number | null
  book_tests: { id: string; title: string; order_index: number; page_start: number | null; page_end: number | null }[]
}

interface ExportBook {
  id: string
  title: string
  subject: string
  publisher: string | null
  level_exam: string | null
  exam_type: string | null
  edition_year: number | null
  tracking_mode: string
  video_mode: string
  video_url: string | null
  description: string | null
  status: string
  book_sections: ExportSection[]
}

function csvCell(value: unknown): string {
  if (value == null) return ''
  let s = String(value)

  // Formül enjeksiyonu: Excel/Sheets `=`, `+`, `-`, `@` ile başlayan bir
  // hücreyi formül olarak yorumlar. Kitap adı `=HYPERLINK(...)` gibi bir
  // metin taşıyorsa dosyayı açan kişide çalışırdı. Tek tırnak öneki
  // hücreyi metne sabitler ve tabloda görünmez.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`

  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(books: ExportBook[]): string {
  const header = [
    'kitap_id', 'kitap_adi', 'ders', 'yayin', 'seviye_sinav', 'baski_yili',
    'takip_turu', 'video_modu', 'video_baglantisi', 'aciklama', 'durum',
    'bolum_adi', 'bolum_sirasi', 'bolum_notu',
    // R7-03: yedek, alt bölüm hiyerarşisini ve basılı aralığı kaybetmemeli.
    'ust_bolum_adi', 'ilk_test', 'son_test',
    'birim_adi', 'birim_sirasi',
    'sayfa_baslangic', 'sayfa_bitis',
  ]
  const rows: string[] = [header.join(',')]

  for (const book of books) {
    const bookCells = [
      book.id, book.title, book.subject, book.publisher, book.level_exam, book.edition_year,
      book.tracking_mode, book.video_mode, book.video_url, book.description, book.status,
    ]
    const sections = [...(book.book_sections ?? [])].sort((a, b) => a.order_index - b.order_index)
    const titleById = new Map(sections.map(s => [s.id, s.title]))

    if (sections.length === 0) {
      rows.push([...bookCells, '', '', '', '', '', '', '', '', '', ''].map(csvCell).join(','))
      continue
    }

    for (const section of sections) {
      const sectionCells = [
        section.title,
        section.order_index,
        section.note,
        section.parent_section_id ? (titleById.get(section.parent_section_id) ?? '') : '',
        section.test_start,
        section.test_end,
      ]
      const tests = [...(section.book_tests ?? [])].sort((a, b) => a.order_index - b.order_index)
      if (tests.length === 0) {
        rows.push([...bookCells, ...sectionCells, '', '', '', ''].map(csvCell).join(','))
        continue
      }
      for (const test of tests) {
        rows.push(
          [
            ...bookCells,
            ...sectionCells,
            test.title, test.order_index, test.page_start, test.page_end,
          ].map(csvCell).join(',')
        )
      }
    }
  }

  return rows.join('\n')
}

export async function GET(request: NextRequest) {
  // getTeacherContext yetkisiz kullanıcıyı zaten yönlendiriyor; export
  // yalnızca kendi çalışma alanının verisini döner.
  const { supabase, workspaceId } = await getTeacherContext()

  const format = request.nextUrl.searchParams.get('format') === 'csv' ? 'csv' : 'json'

  const { data, error } = await supabase
    .from('books')
    .select(`
      id, title, subject, publisher, level_exam, exam_type, edition_year,
      tracking_mode, video_mode, video_url, description, status,
      book_sections(
        id, title, order_index, note, video_url,
        parent_section_id, test_start, test_end,
        book_tests(id, title, order_index, page_start, page_end)
      )
    `)
    .eq('workspace_id', workspaceId)
    .order('title')
    .limit(1000)

  if (error) {
    return NextResponse.json({ error: 'Yedek alınamadı.' }, { status: 500 })
  }

  const books = (data ?? []) as unknown as ExportBook[]
  const stamp = new Date().toISOString().slice(0, 10)

  if (format === 'csv') {
    // BOM: Excel'in UTF-8 Türkçe karakterleri doğru açması için.
    return new NextResponse('﻿' + toCsv(books), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="kitap-havuzu-${stamp}.csv"`,
      },
    })
  }

  return new NextResponse(
    JSON.stringify({ exported_at: new Date().toISOString(), book_count: books.length, books }, null, 2),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="kitap-havuzu-${stamp}.json"`,
      },
    }
  )
}
