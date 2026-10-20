import type { Metadata } from 'next'
import Link from 'next/link'
import { Newspaper, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { DataTable, type Column } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { BLOG_CATEGORY_OPTIONS, blogCategoryLabel } from '@/lib/blog-categories'
import { formatDateTr, formatRelativeTr } from '@/lib/format'

export const metadata: Metadata = {
  title: 'Blog',
}

export const dynamic = 'force-dynamic'

// YÖNETİM: BLOG YAZILARI LİSTESİ.
//
// Satır tipi ELLE yazılı (projedeki tüm yönetim sayfaları gibi):
// `types/database.ts` yer tutucu (`Database = any`), yani RPC dönüşü
// tiplenmiyor. Elle tip, en az sahte bir kesinlik üretmiyor.

interface BlogPostRow {
  id: string
  slug: string
  title: string
  category: string
  status: string
  published_at: string | null
  updated_at: string
  total: number
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Taslak' },
  { value: 'published', label: 'Yayında' },
]

export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string; kategori?: string }>
}) {
  const supabase = await createClient()
  const { durum, kategori } = await searchParams

  // BİLİNMEYEN DEĞER PARAMETREYE HİÇ GEÇMEZ — adres çubuğuna elle
  // yazılan bir şey sorguyu boşa düşürmesin (musteriler/page.tsx:104).
  const statusFilter = STATUS_OPTIONS.some((o) => o.value === durum) ? durum : null
  const categoryFilter = BLOG_CATEGORY_OPTIONS.some((o) => o.value === kategori)
    ? kategori
    : null

  const { data, error } = await supabase.rpc('admin_list_blog_posts', {
    p_status: statusFilter,
    p_category: categoryFilter,
    p_limit: 200,
    p_offset: 0,
  })

  const rows = (data ?? []) as BlogPostRow[]
  const total = rows.length > 0 ? Number(rows[0].total) : 0

  const columns: Column<BlogPostRow>[] = [
    {
      key: 'title',
      header: 'Başlık',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.title}</p>
          {/* Slug görünür: yayındaki adresi yöneticinin bilmesi gerekiyor. */}
          <p className="truncate text-xs text-muted-foreground">/blog/{row.slug}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Kategori',
      hideBelow: 'md',
      render: (row) => <Badge variant="neutral">{blogCategoryLabel(row.category)}</Badge>,
    },
    {
      key: 'status',
      header: 'Durum',
      render: (row) =>
        row.status === 'published' ? (
          <Badge variant="success">Yayında</Badge>
        ) : (
          <Badge variant="neutral">Taslak</Badge>
        ),
    },
    {
      key: 'published_at',
      header: 'Yayın',
      hideBelow: 'sm',
      render: (row) => (
        <span className="text-sm text-muted-foreground">{formatDateTr(row.published_at)}</span>
      ),
    },
    {
      key: 'updated_at',
      header: 'Güncellenme',
      hideBelow: 'lg',
      render: (row) => (
        <span className="text-sm text-muted-foreground">{formatRelativeTr(row.updated_at)}</span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Blog"
        subtitle={
          error
            ? 'Liste yüklenemedi.'
            : `${total} yazı${statusFilter || categoryFilter ? ' (filtreli)' : ''}`
        }
        action={
          <Button size="sm" render={<Link href="/admin/blog/yeni" />}>
            <Plus />
            Yeni yazı
          </Button>
        }
      />

      {/* FİLTRE FORMU GET: durum adreste kalıyor, yani filtreli liste
          paylaşılabilir ve yenilemede kaybolmuyor. JS gerekmiyor. */}
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-40">
          <label htmlFor="durum" className="mb-1.5 block text-xs text-muted-foreground">
            Durum
          </label>
          <NativeSelect id="durum" name="durum" defaultValue={statusFilter ?? ''}>
            <option value="">Tümü</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="min-w-48">
          <label htmlFor="kategori" className="mb-1.5 block text-xs text-muted-foreground">
            Kategori
          </label>
          <NativeSelect id="kategori" name="kategori" defaultValue={categoryFilter ?? ''}>
            <option value="">Tümü</option>
            {BLOG_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <Button type="submit" variant="outline" size="sm">
          Filtrele
        </Button>
        {(statusFilter || categoryFilter) && (
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/admin/blog" />}
          >
            Temizle
          </Button>
        )}
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `/admin/blog/${row.id}`}
        rowLabel={(row) => `${row.title} yazısını düzenle`}
        empty={{
          icon: Newspaper,
          title: statusFilter || categoryFilter ? 'Bu filtreye uyan yazı yok' : 'Henüz yazı yok',
          description: 'Yeni bir yazı oluşturup taslak olarak kaydedebilirsiniz.',
          action: { label: 'Yeni yazı', href: '/admin/blog/yeni' },
        }}
      />
    </div>
  )
}
