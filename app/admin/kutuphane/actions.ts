'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { dbErrorToTr } from '@/lib/auth-errors'
import { libraryReviewSchema, firstIssue } from '@/lib/validation'
import { parseBookBackup, bookIdentityKey } from '@/lib/book-backup'
import { logAudit } from '@/lib/audit'

/** İçe aktarılabilecek en büyük yedek metni — koç tarafıyla aynı sınır. */
const MAX_BACKUP_CHARS = 4_000_000

// KÜTÜPHANE ÖNERİ KARARLARI — yönetim tarafı (069).
//
// Yetki kontrolü BURADA YAPILMIYOR ve bu, /admin/talepler ile aynı
// bilinçli karar: çağrılan RPC'ler gövdelerinde `is_platform_admin()`
// kontrol ediyor. Yetkiyi burada tekrarlamak ikinci bir doğruluk kaynağı
// yaratır ve biri güncellenirken diğeri unutulur.

export async function approveLibrarySubmissionAction(
  bookId: string
): Promise<{ error?: string }> {
  const parsed = libraryReviewSchema.safeParse({ bookId })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const supabase = await createClient()
  const { error } = await supabase.rpc('approve_book_for_library', {
    p_book_id: parsed.data.bookId,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/admin/kutuphane')
  revalidatePath('/teacher/books/library')
  return {}
}

export async function rejectLibrarySubmissionAction(
  bookId: string,
  reason: string
): Promise<{ error?: string }> {
  const parsed = libraryReviewSchema.safeParse({ bookId, reason })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const supabase = await createClient()
  const { error } = await supabase.rpc('reject_book_for_library', {
    p_book_id: parsed.data.bookId,
    p_reason: parsed.data.reason || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/admin/kutuphane')
  return {}
}

/**
 * Kütüphane çalışma alanını kur.
 *
 * Alanın elle SQL ile açılması gerekmesin diye: yönetici bir kez basar,
 * alan yoksa oluşturulur ve kendisi owner olarak eklenir. Zaten varsa
 * hiçbir şey olmaz (RPC idempotent).
 */
export async function ensureLibraryWorkspaceAction(): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('ensure_library_workspace')

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/admin/kutuphane')
  return {}
}


/**
 * YEDEĞİ ORTAK KÜTÜPHANEYE AKTAR (071).
 *
 * Koçun kendi havuzundan aldığı "Yedek al" dosyası, ortak kütüphaneyi
 * doldurmanın en kısa yolu: kaynaklar zaten bir kez düzgün kurulmuş.
 *
 * NEDEN BURADA, KOÇ EKRANINDA DEĞİL: aksi hâlde yönetici önce çalışma
 * alanını kütüphaneye çevirip sonra kitap havuzuna gitmek zorundaydı.
 * İki ekran arası bu yolculuk, "kütüphaneyi kurdum ama dolduramıyorum"
 * sorusunun kaynağıydı.
 *
 * YETKİ: ensure_library_workspace ilk satırda is_platform_admin() arar
 * ve çağıranın kütüphane üyeliğini de tamamlar; onsuz
 * create_book_with_sections_and_tests "Permission denied" derdi.
 *
 * YARIM SONUÇ KABUL EDİLİR — importBookBackupAction ile aynı gerekçe:
 * bir kitap hata verirse işlem durmaz, o kitap atlanır ve rapora yazılır.
 */
export async function importLibraryBackupAction(fileText: string) {
  if (typeof fileText !== 'string' || fileText.length > MAX_BACKUP_CHARS) {
    return { error: 'Dosya çok büyük ya da okunamadı.' }
  }

  const parsed = parseBookBackup(fileText)
  if (parsed.fatal) return { error: parsed.fatal }

  const supabase = await createClient()

  const { data: libraryWorkspaceId, error: ensureError } = await supabase.rpc(
    'ensure_library_workspace'
  )
  if (ensureError) return { error: dbErrorToTr(ensureError.message) }
  if (!libraryWorkspaceId) return { error: 'Kütüphane çalışma alanı bulunamadı.' }

  // AYNI YEDEĞİ İKİ KEZ AKTARMAK KÜTÜPHANEYİ İKİYE KATLAMAMALI.
  const { data: existing } = await supabase
    .from('books')
    .select('title, publisher, edition_year')
    .eq('workspace_id', libraryWorkspaceId)
    .limit(2000)

  const seen = new Set(
    (existing ?? []).map((b) => bookIdentityKey(b.title, b.publisher, b.edition_year))
  )

  let imported = 0
  const skipped: string[] = [...parsed.skipped]

  for (const book of parsed.books) {
    const key = bookIdentityKey(book.title, book.publisher ?? null, book.editionYear ?? null)
    if (seen.has(key)) {
      skipped.push(`${book.title} — kütüphanede zaten var`)
      continue
    }

    // Kitap 'approved' olarak açılır: 070'teki tetikleyici kütüphane
    // alanına giren her satırı yayına alır, burada ayrıca işaretlemek
    // gerekmez.
    const { error } = await supabase.rpc('create_book_with_sections_and_tests', {
      p_workspace_id: libraryWorkspaceId,
      p_academic_term_id: null,
      p_title: book.title,
      p_subject: book.subject,
      p_publisher: book.publisher || null,
      p_level_exam: book.levelExam || null,
      p_edition_year: book.editionYear ?? null,
      p_description: book.description || null,
      p_sections: book.sections,
      p_tracking_mode: book.trackingMode,
      p_video_mode: book.videoMode,
      p_video_url: book.videoUrl || null,
    })

    if (error) {
      skipped.push(`${book.title} — ${dbErrorToTr(error.message)}`)
      continue
    }

    seen.add(key)
    imported++
  }

  await logAudit(supabase, {
    workspaceId: libraryWorkspaceId as string,
    action: 'book.library_import',
    entityType: 'book',
    detail: { imported, skipped: skipped.length },
  })

  revalidatePath('/admin/kutuphane')
  revalidatePath('/teacher/books/library')

  return { imported, skipped }
}
