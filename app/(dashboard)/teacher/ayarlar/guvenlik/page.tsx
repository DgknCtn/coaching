import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { DataTable, type Column } from '@/components/shared/data-table'
import { getTeacherContext } from '@/lib/workspace'
import { authEventLabel } from '@/lib/auth-audit'
import { formatRelativeTr } from '@/lib/format'
import { eventTone, shortUserAgent, locationLabel } from '@/lib/auth-event-display'

export const metadata: Metadata = { title: 'Hesap Hareketleri' }
export const dynamic = 'force-dynamic'

// HESAP HAREKETLERİ — öğretmenin kendi çalışma alanı için.
//
// ============================================================
// YÖNETİM PANELİNDEKİ EKRANIN KOPYASI DEĞİL
// ============================================================
// Yöneticinin sorusu "platformda kim nereden giriyor, saldırı var mı".
// Öğretmenin sorusu bambaşka: "öğrencim siteye giriyor mu, veli paneli
// açıldı mı, benim hesabıma başkası girdi mi".
//
// Bu yüzden burada şüpheli hareket tablosu, ip_hash gruplaması ve
// platform sayaçları YOK. Yalnız kendi kiracısının hareketleri, sade bir
// liste hâlinde.
//
// VERİ SINIRI RLS'TE, BURADA DEĞİL: `teacher_auth_events` bilinçli olarak
// SECURITY DEFINER DEĞİL — çağıranın kendi yetkisiyle okuyor. Yanlışlıkla
// başka bir kiracının verisini döndürmesi bu yüzden imkânsız; sayfanın
// doğruluğu benim `p_workspace_id`yi doğru geçmeme bağlı değil.

const PAGE_SIZE = 30

interface Row {
  id: string
  created_at: string
  event_type: string
  actor_name: string | null
  ip: string | null
  country: string | null
  city: string | null
  user_agent: string | null
  toplam: number
}

export default async function TeacherSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ sayfa?: string }>
}) {
  const { supabase, workspaceId } = await getTeacherContext()
  const { sayfa } = await searchParams
  const page = Math.max(Number.parseInt(sayfa ?? '1', 10) || 1, 1)

  const { data } = await supabase.rpc('teacher_auth_events', {
    p_workspace_id: workspaceId,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  })

  const rows = (data ?? []) as Row[]
  const total = rows[0]?.toplam ?? 0
  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1)

  const columns: Column<Row>[] = [
    {
      key: 'zaman',
      header: 'Zaman',
      render: (r) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {formatRelativeTr(r.created_at)}
        </span>
      ),
    },
    {
      key: 'olay',
      header: 'Olay',
      render: (r) => <Badge variant={eventTone(r.event_type)}>{authEventLabel(r.event_type)}</Badge>,
    },
    {
      key: 'kisi',
      header: 'Kişi',
      render: (r) => (
        <span className="text-sm">
          {r.actor_name ?? <span className="text-muted-foreground">Tanınmayan hesap</span>}
        </span>
      ),
    },
    {
      key: 'ip',
      header: 'IP',
      hideBelow: 'md',
      render: (r) => (
        <span className="font-mono text-xs tabular-nums">
          {r.ip ?? <span className="font-sans text-muted-foreground">saklama süresi doldu</span>}
        </span>
      ),
    },
    {
      key: 'konum',
      header: 'Konum',
      hideBelow: 'lg',
      render: (r) => <span className="text-sm text-muted-foreground">{locationLabel(r)}</span>,
    },
    {
      key: 'cihaz',
      header: 'Cihaz',
      hideBelow: 'lg',
      render: (r) => (
        <span className="text-sm text-muted-foreground">{shortUserAgent(r.user_agent)}</span>
      ),
    },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Hesap Hareketleri"
        subtitle="Çalışma alanınıza yapılan giriş ve çıkışlar"
        action={
          <Button variant="outline" size="sm" render={<Link href="/teacher/ayarlar" />}>
            <ArrowLeft className="size-3.5" />
            Ayarlar
          </Button>
        }
      />

      {/* SAKLAMA SÜRESİ EKRANDA YAZIYOR. Kullanıcıya "IP'nizi tutuyoruz"
          demek yetmez; ne kadar tuttuğumuzu da aynı yerde söylemek
          gerekir, yoksa gizlilik metnini açmak zorunda kalır. */}
      <p className="text-sm text-muted-foreground">
        IP adresi, konum ve cihaz bilgisi <strong className="text-foreground">90 gün</strong>{' '}
        saklanır, sonra silinir. Tanımadığınız bir giriş görürseniz şifrenizi değiştirin.
      </p>

      <Section title={`${total} hareket`}>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          empty={{
            icon: ShieldCheck,
            title: 'Hareket yok',
            description: 'Bu çalışma alanında henüz kaydedilmiş bir giriş hareketi yok.',
          }}
        />

        {pageCount > 1 && (
          <nav
            className="flex items-center justify-between gap-3 pt-4 text-sm"
            aria-label="Sayfalar"
          >
            {page > 1 ? (
              <Link
                className="text-primary underline-offset-4 hover:underline"
                href={`/teacher/ayarlar/guvenlik${page - 1 > 1 ? `?sayfa=${page - 1}` : ''}`}
              >
                ← Önceki
              </Link>
            ) : (
              <span className="text-muted-foreground">← Önceki</span>
            )}

            <span className="tabular-nums text-muted-foreground">
              Sayfa {page} / {pageCount}
            </span>

            {page < pageCount ? (
              <Link
                className="text-primary underline-offset-4 hover:underline"
                href={`/teacher/ayarlar/guvenlik?sayfa=${page + 1}`}
              >
                Sonraki →
              </Link>
            ) : (
              <span className="text-muted-foreground">Sonraki →</span>
            )}
          </nav>
        )}
      </Section>
    </div>
  )
}
