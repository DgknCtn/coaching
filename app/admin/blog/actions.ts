'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { dbErrorToTr } from '@/lib/auth-errors'
import {
  blogPostSchema,
  blogStatusSchema,
  blogDeleteSchema,
  firstIssue,
} from '@/lib/admin/action-schemas'

// BLOG YÖNETİM İŞLEMLERİ (149).
//
// Yetki RPC'nin İÇİNDE (`is_platform_admin()`); buradaki Zod yalnız
// erken ve alan düzeyinde mesaj içindir. Doğruluğun kaynağı veritabanı
// — admin_actions.ts'teki (128) kalıbın aynısı.
//
// GEREKÇE YALNIZ DURUM VE SİLMEDE: taslak kaydetmek yönetim kaydına
// girmiyor, bu yüzden `saveBlogPostAction` gerekçe istemiyor. Her
// kaydetmede 10 karakter gerekçe yazdırmak, bir yazıyı yazarken on kez
// gerekçe yazmak demekti; kimse yazmaz, herkes "güncelleme" yazar ve
// kayıt değersizleşir (149'un karar bloğu).

type Result = { error?: string }

/**
 * Hem yönetim hem PUBLIC yolları tazeler.
 *
 * PUBLIC YOLLAR ATLANSA: blog sayfaları `revalidate = 300` ile
 * önbellekli; yayınlanan yazı beş dakikaya kadar görünmez ve yönetici
 * "yayınladım ama sitede yok" diye bakardı. Bu çağrı, ISR'ı yayın
 * gecikmesi olmadan kullanmayı mümkün kılan şey.
 */
function revalidateBlog(slug?: string | null) {
  revalidatePath('/admin/blog')
  revalidatePath('/blog')
  if (slug) revalidatePath(`/blog/${slug}`)
  // Sitemap yazı listesini DB'den okuyor.
  revalidatePath('/sitemap.xml')
}

/**
 * Taslak kaydet (yeni ya da mevcut).
 *
 * Başarıda `id` ve `slug` döner: yeni yazıda istemci düzenleme
 * sayfasına yönleniyor, slug değiştiyse eski public adres tazeleniyor.
 */
export async function saveBlogPostAction(
  input: unknown
): Promise<Result & { id?: string; slug?: string }> {
  const parsed = blogPostSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const v = parsed.data
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('admin_save_blog_post', {
    p_id: v.id ?? null,
    p_slug: v.slug,
    p_title: v.title,
    p_excerpt: v.excerpt,
    p_content: v.content,
    p_category: v.category,
    // Boş metin NULL'a iner: veritabanı "yok" ile "boş"u ayırıyor.
    p_seo_title: v.seoTitle || null,
    p_seo_description: v.seoDescription || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  const saved = (data ?? {}) as { id?: string; slug?: string }
  revalidateBlog(saved.slug ?? v.slug)
  if (v.id) revalidatePath(`/admin/blog/${v.id}`)

  return { id: saved.id, slug: saved.slug }
}

/** Yayınla / geri çek — gerekçeli, yönetim kaydına yazılır. */
export async function setBlogPostStatusAction(input: unknown): Promise<Result> {
  const parsed = blogStatusSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { id, status, reason } = parsed.data
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('admin_set_blog_post_status', {
    p_id: id,
    p_status: status,
    p_reason: reason,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  const saved = (data ?? {}) as { slug?: string }
  revalidateBlog(saved.slug)
  revalidatePath(`/admin/blog/${id}`)
  revalidatePath('/admin/kayit')

  return {}
}

/** Kalıcı silme — gerekçeli; yazının başlığı aynen yazılmış olmalı. */
export async function deleteBlogPostAction(input: unknown): Promise<Result> {
  const parsed = blogDeleteSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { id, confirm, reason } = parsed.data
  const supabase = await createClient()

  // ONAY METNİ BURADA DENETLENİYOR: 136'daki temizleme işlemlerinde bu
  // denetim RPC'nin içinde (orada silinen şey bir müşterinin tüm
  // verisi). Blog yazısı için aynı ağırlıkta bir kapı gereksiz; onay
  // metninin işi yanlış satırda açılmış diyaloğu yakalamak ve bu
  // istemci/sunucu sınırında yapılabilir. Silmenin YETKİSİ ise yine
  // RPC'de (`is_platform_admin()`).
  const { data: current, error: readError } = await supabase.rpc('admin_get_blog_post', {
    p_id: id,
  })
  if (readError) return { error: dbErrorToTr(readError.message) }

  const post = ((current ?? []) as { title?: string }[])[0]
  if (!post) return { error: 'Yazı bulunamadı.' }
  if (post.title?.trim() !== confirm.trim()) {
    return { error: 'Onay metni yazının başlığıyla aynı değil.' }
  }

  const { data, error } = await supabase.rpc('admin_delete_blog_post', {
    p_id: id,
    p_reason: reason,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  const deleted = (data ?? {}) as { slug?: string }
  revalidateBlog(deleted.slug)
  revalidatePath('/admin/kayit')

  return {}
}
