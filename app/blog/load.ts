import { cache } from 'react'
import { createPublicClient } from '@/lib/supabase/public'
import { reportError } from '@/lib/observability'
import type { BlogCategory } from '@/lib/blog-categories'

// BLOG VERİSİ — PUBLIC OKUMA.
//
// ============================================================
// NEDEN `React.cache`
//
// `app/blog/[slug]/page.tsx` aynı yazıyı İKİ KEZ istiyor: bir kez
// `generateMetadata` (başlık, açıklama, canonical), bir kez sayfanın
// kendisi. Sarmalanmadan iki ayrı veritabanı turu olurdu.
// Aynı kalıp lib/workspace.ts'teki getTeacherContext'te de var.
//
// HATA YUTULMUYOR AMA SAYFA DA ÇÖKMÜYOR: liste okunamazsa boş liste
// döner ve hata `reportError` ile raporlanır. Blog listesinin
// okunamaması tüm sitenin 500 vermesi için yeterli bir sebep değil;
// ama sessizce "henüz yazı yok" demek de yanlış olurdu — bu yüzden
// çağıran taraf `failed` bayrağını görüyor ve farklı bir metin basıyor.
// ============================================================

export interface BlogListItem {
  slug: string
  title: string
  excerpt: string
  category: string
  published_at: string | null
}

export interface BlogPostDetail {
  slug: string
  title: string
  excerpt: string
  content: string
  category: string
  published_at: string | null
  updated_at: string | null
  seo_title: string | null
  seo_description: string | null
  author_name: string
}

export const PAGE_SIZE = 12

export const listPublishedPosts = cache(
  async (
    category: BlogCategory | null,
    offset = 0
  ): Promise<{ posts: BlogListItem[]; total: number; failed: boolean }> => {
    const supabase = createPublicClient()

    const { data, error } = await supabase.rpc('blog_list_published', {
      p_category: category,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    })

    if (error) {
      reportError(new Error(error.message), { source: 'blog.liste', scope: 'blog', code: error.code })
      return { posts: [], total: 0, failed: true }
    }

    const rows = (data ?? []) as (BlogListItem & { total: number })[]

    return {
      posts: rows.map(({ slug, title, excerpt, category: c, published_at }) => ({
        slug,
        title,
        excerpt,
        category: c,
        published_at,
      })),
      // `total` pencere fonksiyonundan geliyor (COUNT(*) OVER ()).
      // Satır yoksa toplam da sıfırdır.
      total: rows.length > 0 ? Number(rows[0].total) : 0,
      failed: false,
    }
  }
)

export const getPublishedPost = cache(
  async (slug: string): Promise<BlogPostDetail | null> => {
    const supabase = createPublicClient()

    const { data, error } = await supabase.rpc('blog_get_published', { p_slug: slug })

    if (error) {
      reportError(new Error(error.message), { source: 'blog.detay', scope: 'blog', code: error.code })
      // NULL dönmek `notFound()` tetikler. Okuma hatasını "yazı yok"
      // saymak doğru değil ama alternatifi de yok: elimizde içerik
      // olmadan sayfa basılamaz. Hata raporlandı.
      return null
    }

    const rows = (data ?? []) as BlogPostDetail[]
    return rows[0] ?? null
  }
)

/** Sitemap için: yayınlanmış yazıların adresi ve son değişiklik tarihi. */
export const listPublishedSlugs = cache(
  async (): Promise<{ slug: string; updated_at: string }[]> => {
    const supabase = createPublicClient()

    const { data, error } = await supabase.rpc('blog_published_slugs')

    if (error) {
      reportError(new Error(error.message), { source: 'blog.sitemap', scope: 'blog', code: error.code })
      // Boş dizi: sitemap STATİK yolları yine döndürür. Blog
      // okunamadığı için sitemap'in tamamını kaybetmek, var olan
      // dokuz sayfanın da dizinden düşmesi riski demekti.
      return []
    }

    return (data ?? []) as { slug: string; updated_at: string }[]
  }
)
