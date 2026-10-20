import Link from 'next/link'
import { blogCategoryLabel } from '@/lib/blog-categories'
import { formatLongDateTr } from '@/lib/format'

// LİSTE KARTI.
//
// KAPAK GÖRSELİ YOK (bilinçli, 149'un karar bloğu): Supabase Storage bu
// projede hiç kullanılmıyor ve CSP img-src yalnız 'self' veriyor.
// Dolayısıyla kart tamamen tipografiyle çalışmak zorunda — hiyerarşi
// üst satırdaki küçük büyük-harf üstbilgi, büyük başlık ve iki satırlık
// özetle kuruluyor.
//
// TÜM KART TIKLANABİLİR: başlıkta ayrı bir bağlantı bırakmak, dokunmatik
// ekranda hedefi gereksiz küçültüyordu. Sarmalayıcı `Link` olduğu için
// içte başka bağlantı YOK (iç içe <a> geçersiz HTML).

export interface BlogPostSummary {
  slug: string
  title: string
  excerpt: string
  category: string
  published_at: string | null
}

export function PostCard({ post }: { post: BlogPostSummary }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col gap-3 rounded-lg border bg-card p-6 transition-colors hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wider text-primary">
          {blogCategoryLabel(post.category)}
        </span>
        {post.published_at && (
          <>
            <span aria-hidden="true">·</span>
            {/* dateTime makine okunur; ekranda Türkçe uzun biçim. */}
            <time dateTime={post.published_at}>{formatLongDateTr(post.published_at)}</time>
          </>
        )}
      </div>

      <h2 className="text-lg font-semibold tracking-tight text-balance text-foreground group-hover:text-primary">
        {post.title}
      </h2>

      {/* line-clamp-3: özet 400 karaktere kadar olabiliyor ve kartların
          yüksekliği birbirinden kopmasın. */}
      <p className="line-clamp-3 text-sm leading-relaxed text-pretty text-muted-foreground">
        {post.excerpt}
      </p>
    </Link>
  )
}
