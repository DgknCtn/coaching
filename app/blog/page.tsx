import type { Metadata } from 'next'
import Link from 'next/link'
import { Newspaper, TriangleAlert } from 'lucide-react'
import { Navbar } from '@/components/marketing/navbar'
import { Footer } from '@/components/marketing/footer'
import { PostCard } from '@/components/blog/post-card'
import { CategoryFilter } from '@/components/blog/category-filter'
import { BlogListStructuredData } from '@/components/blog/blog-structured-data'
import { EmptyState } from '@/components/shared/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { parseBlogCategory, blogCategoryLabel } from '@/lib/blog-categories'
import { BRAND } from '@/lib/brand'
import { listPublishedPosts, PAGE_SIZE } from './load'

// BLOG LİSTESİ.
//
// ============================================================
// BU SAYFA DİNAMİK VE `revalidate` BİLİNÇLİ OLARAK YOK
//
// Sayfa `searchParams` okuyor (kategori filtresi ve sayfalama). Next.js'te
// `searchParams` okuyan bir sayfa HER ZAMAN istek anında render edilir;
// `export const revalidate` yazmak ÖLÜ YAPILANDIRMA olurdu — derleme
// çıktısında bu rota `ƒ (Dynamic)` görünüyor ve ayarın hiçbir etkisi
// olmuyordu. Yanıltıcı bir ayarı yorumla savunmak, ayarı hiç
// yazmamaktan kötü.
//
// MALİYET KABUL EDİLEBİLİR: sayfa tek bir RPC çağırıyor
// (blog_list_published, indeks: status + published_at DESC) ve filtreli
// liste karşılığında PAYLAŞILABİLİR, taranabilir bir adres veriyor.
// Filtreyi istemci durumunda tutmak adresi sabitler, yani
// /blog?kategori=sinav-stratejisi diye bir sayfa hiç var olmazdı.
//
// ÖNBELLEKLENEN SAYFA YAZI DETAYI: app/blog/[slug]/page.tsx
// `searchParams` okumuyor, dolayısıyla orada `revalidate` gerçekten
// çalışıyor — ve trafiğin arama motorundan geleceği yer de o.
//
// Veri `lib/supabase/public.ts` ile çekiliyor — çerez OKUMAYAN istemci.
// `server.ts` kullanılsaydı `cookies()` yüzünden yazı detayı da
// dinamiğe düşer ve oradaki `revalidate` de sessizce işlevsiz kalırdı.
// ============================================================

const DESCRIPTION =
  'Öğrenci takibi, koçluk görüşmeleri ve sınav hazırlığı üzerine ' +
  'öğretmenler için pratik yazılar.'

export const metadata: Metadata = {
  title: 'Blog',
  description: DESCRIPTION,
  // KÖK METADATA'DAKİ canonical '/' EZİLİYOR (app/layout.tsx:39).
  // Verilmezse bu sayfa canonical olarak ana sayfayı ilan eder ve
  // dizine HİÇ girmez — blogun varlık sebebini ortadan kaldıran,
  // ekranda hiçbir belirtisi olmayan bir hata.
  alternates: { canonical: '/blog' },
  openGraph: {
    type: 'website',
    title: `Blog · ${BRAND.name}`,
    description: DESCRIPTION,
    url: '/blog',
  },
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ kategori?: string; sayfa?: string }>
}) {
  const { kategori, sayfa } = await searchParams

  // TANINMAYAN DEĞER SORGUYA HİÇ GEÇMEZ: adres çubuğuna elle yazılan
  // bir kategori sorguyu boşa düşürmesin (app/admin/musteriler:104).
  const category = parseBlogCategory(kategori)

  const page = Math.max(1, Number.parseInt(sayfa ?? '1', 10) || 1)
  const { posts, total, failed } = await listPublishedPosts(category, (page - 1) * PAGE_SIZE)
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex min-h-screen flex-col">
      <BlogListStructuredData />
      <Navbar />

      {/* pt-28: sabit navbar h-16 + nefes payı. /demo'daki pt-[137px]
          bilgi şeridi içindi; blogda şerit yok. */}
      <main className="flex-1 pt-28 pb-16">
        <div className="mx-auto max-w-5xl px-6">
          <header className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">Blog</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance md:text-4xl">
              Öğrenci takibi üzerine yazılar
            </h1>
            <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground">
              {DESCRIPTION}
            </p>
          </header>

          <div className="mt-10">
            <CategoryFilter active={category} />
          </div>

          {failed ? (
            // OKUMA HATASI "YAZI YOK" DEĞİL. İkisini tek ekrana koymak,
            // veritabanı erişilemezken ziyaretçiye blogun boş olduğunu
            // söylemek olurdu.
            <div
              role="alert"
              className="mt-10 flex items-start gap-3 rounded-md border border-warning-border bg-warning-subtle px-4 py-3 text-sm text-warning-foreground"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>
                Yazılar şu anda yüklenemedi. Lütfen birazdan tekrar deneyin.
              </p>
            </div>
          ) : posts.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={Newspaper}
                title={
                  category
                    ? `${blogCategoryLabel(category)} kategorisinde henüz yazı yok`
                    : 'Henüz yazı yayınlanmadı'
                }
                description="Yeni yazılar yayınlandıkça burada görünecek."
                action={category ? { label: 'Tüm yazılar', href: '/blog' } : undefined}
              />
            </div>
          ) : (
            <>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {posts.map((post) => (
                  <PostCard key={post.slug} post={post} />
                ))}
              </div>

              {lastPage > 1 && (
                <nav
                  aria-label="Sayfalar"
                  className="mt-10 flex items-center justify-between gap-4"
                >
                  {page > 1 ? (
                    <Link
                      href={pageHref(category, page - 1)}
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    >
                      Önceki
                    </Link>
                  ) : (
                    <span />
                  )}

                  <p className="text-sm text-muted-foreground">
                    Sayfa {page} / {lastPage}
                  </p>

                  {page < lastPage ? (
                    <Link
                      href={pageHref(category, page + 1)}
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    >
                      Sonraki
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}

/** Birinci sayfaya `?sayfa=1` YAZILMAZ: aynı içeriğin iki adresi olmasın. */
function pageHref(category: string | null, page: number): string {
  const params = new URLSearchParams()
  if (category) params.set('kategori', category)
  if (page > 1) params.set('sayfa', String(page))
  const query = params.toString()
  return query ? `/blog?${query}` : '/blog'
}
