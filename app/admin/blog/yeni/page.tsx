import type { Metadata } from 'next'
import { PageHeader } from '@/components/shared/page-header'
import { BlogPostForm } from '@/components/admin/blog-post-form'

export const metadata: Metadata = {
  title: 'Yeni blog yazısı',
}

export const dynamic = 'force-dynamic'

// YENİ YAZI.
//
// Veri çekmiyor: form boş başlıyor. Yetki kontrolü app/admin/layout.tsx'te
// (is_platform_admin RPC) — alt sayfalar ayrıca guard yazmıyor, asıl
// savunma zaten kaydetme RPC'sinin içinde.

export default function NewBlogPostPage() {
  return (
    <div>
      <PageHeader
        title="Yeni yazı"
        subtitle="Yazı taslak olarak kaydedilir; yayınlamak ayrı bir adım."
        backHref="/admin/blog"
      />
      <BlogPostForm post={null} />
    </div>
  )
}
