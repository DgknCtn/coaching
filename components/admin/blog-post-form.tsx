'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Eye, ExternalLink, Pencil, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ActionDialog } from '@/components/admin/action-dialog'
import { MarkdownContent } from '@/components/blog/markdown-content'
import { blogPostSchema } from '@/lib/admin/action-schemas'
import { BLOG_CATEGORY_OPTIONS } from '@/lib/blog-categories'
import { slugify } from '@/lib/blog-slug'
import { readingMinutes } from '@/lib/blog-markdown'
import {
  saveBlogPostAction,
  setBlogPostStatusAction,
  deleteBlogPostAction,
} from '@/app/admin/blog/actions'
import type { z } from 'zod'

// BLOG YAZISI FORMU.
//
// ============================================================
// NEDEN react-hook-form — YÖNETİM PANELİNİN GERİ KALANI useState KULLANIYOR
//
// Paneldeki mevcut kalıp (ActionDialog ve türevleri) bir-iki alanlı
// diyaloglar için: gün sayısı, gerekçe, onay metni. Bu form yedi alanlı
// ve her alanın ayrı bir Türkçe hata mesajı göstermesi gerekiyor.
// `useState` ile yazıldığında yedi ayrı hata state'i ve elle doğrulama
// demekti. Projede bunun hazır karşılığı var:
// app/(dashboard)/teacher/books/new/book-form.tsx — rhf + zodResolver +
// aria-invalid/aria-describedby. Aynı kalıp burada tekrarlanıyor.
//
// ŞEMA SUNUCUYLA PAYLAŞILIYOR (lib/admin/action-schemas.ts):
// book-form.tsx istemci için ayrı bir şema yazıyor; burada buna gerek
// yok çünkü blogPostSchema saf zod (DOM/sunucu bağımlılığı yok) ve
// ikinci bir kopya iki sınırın sessizce ayrışması demekti.
//
// ÖNİZLEME SUNUCUYA GİTMİYOR: lib/blog-markdown.ts saf TypeScript,
// yani istemcide de çalışıyor. Sekme değişimi yalnız `useState`;
// URL tabanlı link-tabs kullanılsaydı sayfa yeniden yüklenir ve
// KAYDEDİLMEMİŞ YAZI KAYBOLURDU.
// ============================================================

type FormValues = z.infer<typeof blogPostSchema>

export interface BlogPostFormData {
  id: string
  slug: string
  title: string
  excerpt: string
  content: string
  category: string
  status: string
  published_at: string | null
  updated_at: string
  seo_title: string | null
  seo_description: string | null
}

const ORNEK_ICERIK = `## Alt başlık

Paragraf metni. **Kalın**, *italik* ve [bağlantı](/demo) kullanabilirsiniz.

- Liste maddesi
- İkinci madde

> Alıntı satırı.`

export function BlogPostForm({ post }: { post: BlogPostFormData | null }) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'yaz' | 'onizleme'>('yaz')

  // SLUG BAŞLIKTAN TÜRETİLSİN Mİ?
  //
  // YENİ yazıda evet: yazar başlığı yazarken adres kendiliğinden oluşur.
  // MEVCUT yazıda HER ZAMAN HAYIR — ve bu, tek bir boolean'ın iki ayrı
  // şey ifade etmesini önlemek için ayrı bir karar: slug yayındaki
  // adres, başlıkla birlikte sessizce değişmesi her paylaşılmış
  // bağlantıyı kırardı. Mevcut yazıda adres yalnız ELLE, uyarıyı
  // görerek değişir.
  const [otomatikSlug, setOtomatikSlug] = useState(post === null)

  const published = post?.status === 'published'

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(blogPostSchema),
    defaultValues: {
      id: post?.id,
      slug: post?.slug ?? '',
      title: post?.title ?? '',
      excerpt: post?.excerpt ?? '',
      content: post?.content ?? '',
      category: (post?.category as FormValues['category']) ?? BLOG_CATEGORY_OPTIONS[0].value,
      seoTitle: post?.seo_title ?? '',
      seoDescription: post?.seo_description ?? '',
    },
  })

  const content = watch('content')
  const slug = watch('slug')
  const title = watch('title')
  const slugDegisti = post !== null && slug !== post.slug

  function onTitleChange(value: string) {
    setValue('title', value, { shouldValidate: false })
    if (otomatikSlug) setValue('slug', slugify(value), { shouldValidate: false })
  }

  function submit(values: FormValues) {
    setServerError(null)
    setSaving(true)
    void (async () => {
      const result = await saveBlogPostAction(values)
      setSaving(false)

      if (result.error) {
        setServerError(result.error)
        return
      }

      toast.success('Yazı kaydedildi.')

      // Yeni yazı: artık bir id'si var, düzenleme adresine geç. Formda
      // kalınsa ikinci kaydetme ikinci bir yazı oluştururdu.
      if (!post && result.id) {
        router.push(`/admin/blog/${result.id}`)
        return
      }
      router.refresh()
    })()
  }

  /** Enter formu kazara göndermesin — book-form.tsx'teki aynı koruma. */
  function blockEnterSubmit(event: React.KeyboardEvent<HTMLFormElement>) {
    const target = event.target as HTMLElement
    if (event.key === 'Enter' && target.tagName !== 'TEXTAREA') {
      event.preventDefault()
    }
  }

  return (
    <div className="space-y-6">
      {/* DURUM ŞERİDİ — yayın işlemleri formun DIŞINDA.
          Yayınlamak, kaydetmekten ayrı bir karar: gerekçe istiyor ve
          yönetim kaydına yazılıyor. Tek bir "Kaydet ve yayınla" düğmesi
          bu ayrımı silerdi. */}
      {post && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card px-4 py-3">
          {published ? (
            <Badge variant="success">Yayında</Badge>
          ) : (
            <Badge variant="neutral">Taslak</Badge>
          )}

          <p className="flex-1 text-sm text-muted-foreground">
            {published
              ? 'Yazı herkese açık ve arama motoruna açık.'
              : 'Taslak yalnız burada görünür; public sayfada yer almaz.'}
          </p>

          {published && (
            <Link
              href={`/blog/${post.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-4"
            >
              Sitede gör
              <ExternalLink className="size-3.5" />
            </Link>
          )}

          <ActionDialog
            triggerLabel={published ? 'Geri çek' : 'Yayınla'}
            title={published ? 'Yazıyı geri çek' : 'Yazıyı yayınla'}
            description={
              published
                ? 'Yazı public sayfadan kaldırılır ve adresi 404 döner. İlk yayın tarihi korunur.'
                : 'Yazı herkese açık hâle gelir, sitemap ve arama motoruna girer.'
            }
            preview={
              <p>
                <span className="text-muted-foreground">Adres: </span>
                <span className="font-medium text-foreground">/blog/{post.slug}</span>
              </p>
            }
            submitLabel={published ? 'Geri çek' : 'Yayınla'}
            successMessage={published ? 'Yazı geri çekildi.' : 'Yazı yayınlandı.'}
            onSubmit={(reason) =>
              setBlogPostStatusAction({
                id: post.id,
                status: published ? 'draft' : 'published',
                reason,
              })
            }
          />

          <ActionDialog
            triggerLabel="Sil"
            title="Yazıyı kalıcı olarak sil"
            description="Bu işlem geri alınamaz. Yazı ve içeriği tamamen silinir."
            destructive
            confirmPhrase={post.title}
            preview={
              <p>
                <span className="text-muted-foreground">Silinecek: </span>
                <span className="font-medium text-foreground">{post.title}</span>
              </p>
            }
            submitLabel="Kalıcı olarak sil"
            successMessage="Yazı silindi."
            onSubmit={async (reason, confirm) => {
              const result = await deleteBlogPostAction({ id: post.id, confirm, reason })
              if (!result.error) router.push('/admin/blog')
              return result
            }}
          />
        </div>
      )}

      <form onSubmit={handleSubmit(submit)} onKeyDown={blockEnterSubmit} className="space-y-6">
        <div className="space-y-5 rounded-lg border bg-card p-6">
          <div>
            <Label htmlFor="title">Başlık</Label>
            <Input
              id="title"
              {...register('title')}
              onChange={(e) => onTitleChange(e.target.value)}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'title-error' : undefined}
              className="mt-1.5"
              placeholder="Koçluk görüşmesi nasıl yapılır"
            />
            {errors.title && (
              <p id="title-error" className="mt-1.5 text-xs text-destructive">
                {errors.title.message}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="slug">Adres (slug)</Label>
              {otomatikSlug ? (
                // Otomatik moddan çıkış: alan açılır, başlık artık adresi
                // değiştirmez.
                <button
                  type="button"
                  onClick={() => setOtomatikSlug(false)}
                  className="text-xs text-primary underline underline-offset-4"
                >
                  Elle düzenle
                </button>
              ) : (
                // TEK SEFERLİK üretim — otomatik moda GERİ DÖNDÜRMEZ.
                // Döndürseydi, mevcut bir yazının başlığını düzeltmek
                // yayındaki adresi de sessizce değiştirirdi.
                <button
                  type="button"
                  onClick={() => setValue('slug', slugify(title), { shouldValidate: false })}
                  className="text-xs text-muted-foreground underline underline-offset-4"
                >
                  Başlıktan üret
                </button>
              )}
            </div>
            <Input
              id="slug"
              {...register('slug')}
              readOnly={otomatikSlug}
              aria-invalid={!!errors.slug}
              aria-describedby={errors.slug ? 'slug-error' : 'slug-hint'}
              className="mt-1.5 font-mono text-sm"
              placeholder="kocluk-gorusmesi-nasil-yapilir"
            />
            {errors.slug ? (
              <p id="slug-error" className="mt-1.5 text-xs text-destructive">
                {errors.slug.message}
              </p>
            ) : (
              <p id="slug-hint" className="mt-1.5 text-xs text-muted-foreground">
                Yayındaki adres: /blog/{slug || '…'}
              </p>
            )}

            {/* SLUG DEĞİŞİKLİĞİ UYARISI: yönlendirme tablosu yok, yani
                eski adres 404 döner. Bu, yazıyı yayınladıktan sonra
                yapılabilecek en pahalı sessiz hata. */}
            {slugDegisti && (
              <div
                role="alert"
                className="mt-2 flex items-start gap-2 rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-xs text-warning-foreground"
              >
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <p>
                  Adresi değiştiriyorsunuz. Eski adres (<code>/blog/{post?.slug}</code>)
                  bundan sonra 404 dönecek ve paylaşılmış bağlantılar kırılacak.
                </p>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="category">Kategori</Label>
            <NativeSelect
              id="category"
              {...register('category')}
              aria-invalid={!!errors.category}
              className="mt-1.5"
            >
              {BLOG_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            {errors.category && (
              <p className="mt-1.5 text-xs text-destructive">{errors.category.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="excerpt">Özet</Label>
            <Textarea
              id="excerpt"
              {...register('excerpt')}
              rows={3}
              aria-invalid={!!errors.excerpt}
              aria-describedby={errors.excerpt ? 'excerpt-error' : 'excerpt-hint'}
              className="mt-1.5"
              placeholder="Liste kartında ve arama sonucunda görünecek iki cümle."
            />
            {errors.excerpt ? (
              <p id="excerpt-error" className="mt-1.5 text-xs text-destructive">
                {errors.excerpt.message}
              </p>
            ) : (
              <p id="excerpt-hint" className="mt-1.5 text-xs text-muted-foreground">
                Liste kartında ve arama açıklaması boşsa orada kullanılır. 20-400 karakter.
              </p>
            )}
          </div>
        </div>

        {/* İÇERİK + ÖNİZLEME */}
        <div className="rounded-lg border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={tab === 'yaz' ? 'secondary' : 'ghost'}
                onClick={() => setTab('yaz')}
              >
                <Pencil />
                Yaz
              </Button>
              <Button
                type="button"
                size="sm"
                variant={tab === 'onizleme' ? 'secondary' : 'ghost'}
                onClick={() => setTab('onizleme')}
              >
                <Eye />
                Önizleme
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {content ? `${readingMinutes(content)} dk okuma` : 'Markdown desteklenir'}
            </p>
          </div>

          <div className="p-6">
            {tab === 'yaz' ? (
              <div>
                <Label htmlFor="content" className="sr-only">
                  İçerik
                </Label>
                <Textarea
                  id="content"
                  {...register('content')}
                  rows={24}
                  aria-invalid={!!errors.content}
                  aria-describedby={errors.content ? 'content-error' : 'content-hint'}
                  className="font-mono text-sm"
                  placeholder={ORNEK_ICERIK}
                />
                {errors.content ? (
                  <p id="content-error" className="mt-1.5 text-xs text-destructive">
                    {errors.content.message}
                  </p>
                ) : (
                  <p id="content-hint" className="mt-2 text-xs text-muted-foreground">
                    Desteklenen biçimler: <code>## başlık</code>, <code>### alt başlık</code>,{' '}
                    <code>**kalın**</code>, <code>*italik*</code>, <code>`kod`</code>,{' '}
                    <code>- liste</code>, <code>1. liste</code>, <code>&gt; alıntı</code>,{' '}
                    <code>[metin](/adres)</code>. Görsel ve HTML desteklenmez; yazdığınız
                    gibi görünür.
                  </p>
                )}
              </div>
            ) : (
              <div>
                {content?.trim() ? (
                  <MarkdownContent source={content} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Önizlenecek içerik yok. &quot;Yaz&quot; sekmesine geçip yazmaya başlayın.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ARAMA MOTORU ALANLARI — opsiyonel, bu yüzden ayrı ve sonda. */}
        <div className="space-y-5 rounded-lg border bg-card p-6">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Arama motoru
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Boş bırakılırsa başlık ve özet kullanılır.
            </p>
          </div>

          <Separator />

          <div>
            <Label htmlFor="seoTitle">Arama başlığı</Label>
            <Input
              id="seoTitle"
              {...register('seoTitle')}
              aria-invalid={!!errors.seoTitle}
              className="mt-1.5"
              placeholder={title || 'Boş: başlık kullanılır'}
            />
            {errors.seoTitle && (
              <p className="mt-1.5 text-xs text-destructive">{errors.seoTitle.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="seoDescription">Arama açıklaması</Label>
            <Textarea
              id="seoDescription"
              {...register('seoDescription')}
              rows={2}
              aria-invalid={!!errors.seoDescription}
              className="mt-1.5"
              placeholder="Boş: özet kullanılır. 20-160 karakter."
            />
            {errors.seoDescription && (
              <p className="mt-1.5 text-xs text-destructive">{errors.seoDescription.message}</p>
            )}
          </div>
        </div>

        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Kaydediliyor…' : post ? 'Değişiklikleri kaydet' : 'Taslak olarak kaydet'}
          </Button>
          <Button type="button" variant="ghost" render={<Link href="/admin/blog" />}>
            Vazgeç
          </Button>
          {!post && (
            <p className="text-xs text-muted-foreground">
              Yazı taslak olarak kaydedilir; yayınlamak ayrı bir adım.
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
