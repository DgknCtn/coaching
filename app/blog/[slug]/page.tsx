import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Navbar } from '@/components/marketing/navbar'
import { Footer } from '@/components/marketing/footer'
import { MarkdownContent } from '@/components/blog/markdown-content'
import { BlogPostStructuredData } from '@/components/blog/blog-structured-data'
import { buttonVariants } from '@/components/ui/button'
import { blogCategoryLabel } from '@/lib/blog-categories'
import { readingMinutes } from '@/lib/blog-markdown'
import { formatLongDateTr } from '@/lib/format'
import { BRAND } from '@/lib/brand'
import { TRIAL_CTA_LABEL } from '@/lib/plans'
import { getPublishedPost } from '../load'

// YAZI DETAYI.
//
// TASLAK BURAYA HİÇ GELMEZ: `blog_get_published` yalnız
// status='published' AND published_at <= NOW() satırını döndürüyor,
// yani taslak için `notFound()` çalışır. Yetki kontrolü uygulamada
// DEĞİL veritabanında — yazının gizliliği bir `if`e bağlı değil.
//
// ============================================================
// ÖNBELLEK (`revalidate`) — PROJEDE İLK ISR KULLANIMI
//
// Bu sayfa `searchParams` ya da `cookies()` OKUMUYOR, yani render
// çıktısı önbelleğe alınabilir. İlk istekte üretiliyor, sonraki 300
// saniye boyunca önbellekten veriliyor.
//
// Yayın ANINDA görünüyor: yönetim eylemleri `revalidatePath('/blog/<slug>')`
// çağırıyor (app/admin/blog/actions.ts). 300 saniye bir "yayın
// gecikmesi" değil, panel dışından değişen bir şey olursa (elle
// veritabanı düzenlemesi) üst sınır.
//
// `generateStaticParams` KULLANILMIYOR: derleme anında veritabanına
// bağlanmayı gerektirirdi ve panelden eklenen yeni bir yazı, bir
// sonraki dağıtıma kadar 404 dönerdi — blogun panelden yönetilebilmesi
// fikrine aykırı. Bedeli, derleme çıktısında rotanın `ƒ` görünmesi:
// hiçbir adres önceden üretilmiyor, önbellek ilk istekte doluyor.
// ============================================================

export const revalidate = 300

/**
 * PROJEDE `generateMetadata`IN İLK KULLANIMI.
 *
 * Diğer tüm sayfalar statik `export const metadata` kullanıyor çünkü
 * başlıkları sabit. Yazı başlığı ise veritabanından geliyor; statik
 * metadata ile her yazı aynı başlığı paylaşırdı.
 *
 * Veri İKİ KEZ İSTENİYOR ama BİR KEZ çekiliyor: `getPublishedPost`
 * `React.cache` ile sarılı (app/blog/load.ts).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await getPublishedPost(slug)

  // BULUNAMAYAN YAZI İÇİN `notFound()` ÇAĞRILMIYOR: metadata üretimi
  // sayfanın render'ından ayrı çalışıyor ve 404'ü sayfa veriyor. Burada
  // yalnız dizine girmeyecek sade bir başlık döndürülüyor.
  if (!post) {
    return {
      title: 'Yazı bulunamadı',
      robots: { index: false, follow: true },
    }
  }

  const description = post.seo_description ?? post.excerpt

  return {
    // seo_title yoksa başlığın kendisi. İki alanı zorunlu kılmak her
    // yazıda aynı metni iki kez yazdırmak olurdu.
    title: post.seo_title ?? post.title,
    description,
    // KÖK canonical '/' EZİLİYOR — verilmezse yazı kendi adresini değil
    // ana sayfayı canonical ilan eder ve dizine girmez.
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.seo_title ?? post.title,
      description,
      url: `/blog/${post.slug}`,
      ...(post.published_at ? { publishedTime: post.published_at } : {}),
      ...(post.updated_at ? { modifiedTime: post.updated_at } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: post.seo_title ?? post.title,
      description,
    },
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPublishedPost(slug)

  if (!post) notFound()

  return (
    <div className="flex min-h-screen flex-col">
      <BlogPostStructuredData
        slug={post.slug}
        title={post.title}
        excerpt={post.excerpt}
        content={post.content}
        publishedAt={post.published_at}
        updatedAt={post.updated_at}
        authorName={post.author_name}
      />
      <Navbar />

      <main className="flex-1 pt-28 pb-16">
        <article className="mx-auto max-w-3xl px-6">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Tüm yazılar
          </Link>

          <header className="mt-8">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <Link
                href={`/blog?kategori=${post.category}`}
                className="font-medium uppercase tracking-wider text-primary hover:underline"
              >
                {blogCategoryLabel(post.category)}
              </Link>
              {post.published_at && (
                <>
                  <span aria-hidden="true">·</span>
                  <time dateTime={post.published_at}>
                    {formatLongDateTr(post.published_at)}
                  </time>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>{readingMinutes(post.content)} dk okuma</span>
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance md:text-4xl">
              {post.title}
            </h1>

            {/* Özet yazının girişi olarak da iş görüyor: liste kartında
                gördüğü metni burada tekrar görmek, okuyucuya doğru
                yazıya girdiğini doğruluyor. */}
            <p className="mt-5 text-base leading-relaxed text-pretty text-muted-foreground">
              {post.excerpt}
            </p>
          </header>

          <hr className="mt-10" />

          <div className="mt-10">
            <MarkdownContent source={post.content} />
          </div>

          {/* Yazının sonundaki tek çağrı. Deneme etiketi lib/plans.ts'ten
              okunuyor — süre değiştiğinde burası da değişsin. */}
          <aside className="mt-16 rounded-lg border bg-muted/30 p-6">
            <p className="text-base font-semibold tracking-tight text-foreground">
              {BRAND.tagline}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Öğrencilerinizin ödevlerini, kaynaklarını ve haftalık akışını tek yerden
              takip edin.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/register" className={buttonVariants({ size: 'sm' })}>
                {TRIAL_CTA_LABEL}
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/demo"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Demoyu gez
              </Link>
            </div>
          </aside>
        </article>
      </main>

      <Footer />
    </div>
  )
}
