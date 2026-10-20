import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { BlogPostForm, type BlogPostFormData } from '@/components/admin/blog-post-form'
import { formatDateTimeTr } from '@/lib/format'

export const metadata: Metadata = {
  title: 'Blog yazısı',
}

export const dynamic = 'force-dynamic'

// YAZI DÜZENLEME.
//
// TASLAĞI BURADA GÖRÜYORUZ: `admin_get_blog_post` yayın filtresi
// uygulamıyor (public `blog_get_published` uyguluyor). Yani taslak için
// ayrı bir önizleme adresi ya da paylaşım token'ı GEREKMEDİ — admin
// alanı zaten oturum ve is_platform_admin() arkasında.

export default async function AdminBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('admin_get_blog_post', { p_id: id })

  // Hata ile "kayıt yok" ayrımı: ikisi de sayfayı basamıyor ama hata
  // yutulmuyor — RPC hatası konsola düşsün, 404 sessiz kalmasın.
  if (error) {
    console.error(
      '[admin/blog] yazı okunamadı:',
      JSON.stringify({ id, message: error.message })
    )
    notFound()
  }

  const post = ((data ?? []) as BlogPostFormData[])[0]
  if (!post) notFound()

  return (
    <div>
      <PageHeader
        title={post.title}
        subtitle={`Son güncelleme: ${formatDateTimeTr(post.updated_at)}`}
        backHref="/admin/blog"
      />
      <BlogPostForm post={post} />
    </div>
  )
}
