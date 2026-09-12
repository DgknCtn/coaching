import type { Metadata } from 'next'
import { ShieldAlert, ShieldCheck, ShieldX, Users, Globe, Trash2, Radio } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { EmptyState } from '@/components/shared/empty-state'
import { DataTable, type Column } from '@/components/shared/data-table'
import { MetricTiles, type MetricTile } from '@/components/shared/metric-tiles'
import { createClient } from '@/lib/supabase/server'
import { authEventLabel } from '@/lib/auth-audit'
import { formatRelativeTr } from '@/lib/format'
import { eventTone, shortUserAgent, locationLabel } from '@/lib/auth-event-display'
import { SecurityFilters } from './security-filters'

export const metadata: Metadata = { title: 'Güvenlik' }
export const dynamic = 'force-dynamic'

// GÜVENLİK — yönetim görünümü (089/090).
//
// NE CEVAPLAR: kim, ne zaman, nereden girdi; kim giremedi; hangi kaynak
// birden çok hesaba yükleniyor.
//
// FİLTRE VE SAYFALAMA SUNUCUDA. Bu tablo zamanla en büyük tablolardan
// biri olacak — her giriş bir satır. Tamamını çekip istemcide süzmek,
// panelin birkaç ay içinde kullanılamaz hâle gelmesi demekti.
//
// "KİM ONLINE" HENÜZ YOK: doğru kaynak Supabase'in `auth.sessions`
// tablosu ve ona okuma yetkisi verilmedi. Varsayımla sorgu yazmaktansa
// eksik bırakmak doğru — bu projede bir kez, çalışma zamanında patlayan
// ama migration sırasında görünmeyen bir SQL (083) tam olarak böyle
// üretildi.

const PAGE_SIZE = 50

interface AuthEventRow {
  id: string
  created_at: string
  event_type: string
  actor_name: string | null
  profile_id: string | null
  workspace_id: string | null
  workspace_name: string | null
  ip: string | null
  country: string | null
  city: string | null
  user_agent: string | null
  detail: Record<string, unknown>
  toplam: number
}

interface SuspiciousRow {
  ip_hash: string
  ornek_ip: string | null
  hesap_sayisi: number
  basarisiz: number
  engellenen: number
  basarili: number
  ulkeler: string | null
  son_olay: string
}

interface ActiveUserRow {
  profile_id: string
  actor_name: string | null
  workspace_id: string | null
  workspace_name: string | null
  son_giris: string
  ip: string | null
  country: string | null
  city: string | null
  user_agent: string | null
}

interface SummaryRow {
  basarili: number
  basarisiz: number
  engellenen: number
  farkli_hesap: number
  farkli_kaynak: number
  temizlenecek_ip: number
}

/** Adres çubuğuna elle yazılan bir değer sorguyu boşa düşürmesin. */
const EVENT_TYPES = [
  'login.success',
  'login.failed',
  'login.rate_limited',
  'logout',
  'password_reset_requested',
  'password_changed',
  'register',
  'session_revoked',
] as const

export default async function AdminSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ tur?: string; q?: string; sayfa?: string }>
}) {
  const supabase = await createClient()
  const { tur, q, sayfa } = await searchParams

  const eventType = EVENT_TYPES.includes(tur as (typeof EVENT_TYPES)[number]) ? tur! : null
  const page = Math.max(Number.parseInt(sayfa ?? '1', 10) || 1, 1)

  const [{ data: summaryRows }, { data: eventRows }, { data: suspiciousRows }, { data: activeRows }] =
    await Promise.all([
      supabase.rpc('admin_auth_summary', { p_hours: 24 }),
      supabase.rpc('admin_auth_events', {
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
        p_event_type: eventType,
        p_search: q || null,
        p_since: null,
      }),
      supabase.rpc('admin_auth_suspicious', { p_hours: 168, p_limit: 20 }),
      supabase.rpc('admin_active_users', { p_hours: 12 }),
    ])

  const summary = ((summaryRows ?? []) as SummaryRow[])[0]
  const events = (eventRows ?? []) as AuthEventRow[]
  const suspicious = (suspiciousRows ?? []) as SuspiciousRow[]
  const active = (activeRows ?? []) as ActiveUserRow[]

  // Toplam HER SATIRDA geliyor (090): ayrı bir COUNT sorgusu farklı bir
  // anda çalışıp sayfalamayla tutarsız bir toplam verebilirdi.
  const total = events[0]?.toplam ?? 0
  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1)

  const tiles: MetricTile[] = [
    { label: 'Başarılı giriş (24s)', value: summary?.basarili ?? 0, icon: ShieldCheck, tone: 'success' },
    { label: 'Başarısız deneme (24s)', value: summary?.basarisiz ?? 0, icon: ShieldX, tone: summary?.basarisiz ? 'warning' : 'default' },
    { label: 'Engellenen (24s)', value: summary?.engellenen ?? 0, icon: ShieldAlert, tone: summary?.engellenen ? 'destructive' : 'default' },
    { label: 'Farklı hesap (24s)', value: summary?.farkli_hesap ?? 0, icon: Users },
    { label: 'Farklı kaynak (24s)', value: summary?.farkli_kaynak ?? 0, icon: Globe },
  ]

  const columns: Column<AuthEventRow>[] = [
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
      key: 'alan',
      header: 'Çalışma alanı',
      hideBelow: 'lg',
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.workspace_name ?? '—'}</span>
      ),
    },
    {
      key: 'ip',
      header: 'IP',
      hideBelow: 'md',
      render: (r) => (
        <span className="font-mono text-xs tabular-nums">
          {r.ip ?? <span className="text-muted-foreground">saklama süresi doldu</span>}
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
    <div className="space-y-6">
      <PageHeader
        title="Güvenlik"
        subtitle="Giriş hareketleri, kaynak adresler ve şüpheli denemeler."
      />

      <MetricTiles metrics={tiles} />

      {/* SAKLAMA SÜRESİ GÖRÜNÜR: 90 günü geçmiş ama hâlâ adres taşıyan
          satır varsa temizlik çalışmamış demektir. Sessizce birikmesi,
          KVKK taahhüdünün sessizce ihlali olurdu. */}
      {summary && summary.temizlenecek_ip > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <Trash2 className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <div className="text-sm">
            <p className="font-medium">Saklama süresi dolmuş kayıt var</p>
            <p className="text-muted-foreground">
              {summary.temizlenecek_ip} kayıtta 90 günü geçmiş adres/cihaz bilgisi hâlâ duruyor.
              Temizlik için <code className="font-mono text-xs">purge_auth_event_ips()</code>{' '}
              çalıştırılmalı.
            </p>
          </div>
        </div>
      )}

      <Section
        title="Şu an aktif"
        description="Son 12 saatte giriş yapmış ve çıkış yapmamış kullanıcılar."
      >
        {/* BU BİR YAKLAŞIKLIK VE BUNU SÖYLÜYORUZ.
            Kesin cevap Supabase'in auth.sessions tablosunda; oraya okuma
            yetkisi verilmediği için burada auth_events'ten türetiliyor.
            Sekmeyi kapatan ama çıkış yapmayan kullanıcı bir süre listede
            kalır. Yaklaşık olduğunu söyleyen bir ekran, kesin olduğunu
            ima eden yanlış bir ekrandan iyidir. */}
        {active.length === 0 ? (
          <EmptyState
            icon={Radio}
            title="Aktif kullanıcı yok"
            description="Son 12 saatte açık kalmış bir oturum görünmüyor."
          />
        ) : (
          <>
            <DataTable columns={activeColumns} rows={active} rowKey={(r) => r.profile_id} />
            <p className="pt-3 text-xs text-muted-foreground">
              Bu liste giriş/çıkış kayıtlarından türetiliyor: sekmesini kapatan ama çıkış
              yapmayan kullanıcı bir süre daha görünür. Oturumun sunucuda gerçekten açık
              olup olmadığı burada ölçülmüyor.
            </p>
          </>
        )}
      </Section>

      <Section
        title="Şüpheli hareket"
        description="Son 7 günde birden çok hesaba dokunan ya da başarısız deneme üreten kaynaklar."
      >
        {suspicious.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Şüpheli hareket yok"
            description="Son 7 günde birden çok hesaba yüklenen ya da başarısız deneme üreten bir kaynak görülmedi."
          />
        ) : (
          <DataTable
            columns={suspiciousColumns}
            rows={suspicious}
            rowKey={(r) => r.ip_hash}
          />
        )}
      </Section>

      <Section title="Giriş kayıtları" description={`${total} kayıt`}>
        <SecurityFilters selectedType={eventType} search={q ?? ''} />

        <DataTable
          columns={columns}
          rows={events}
          rowKey={(r) => r.id}
          empty={{
            icon: ShieldCheck,
            title: 'Kayıt yok',
            description:
              q || eventType
                ? 'Bu filtreye uyan bir hareket bulunamadı.'
                : 'Henüz giriş hareketi kaydedilmedi.',
          }}
        />

        {pageCount > 1 && (
          <Pagination page={page} pageCount={pageCount} tur={eventType} q={q ?? ''} />
        )}
      </Section>
    </div>
  )
}

const activeColumns: Column<ActiveUserRow>[] = [
  {
    key: 'kisi',
    header: 'Kişi',
    render: (r) => <span className="text-sm font-medium">{r.actor_name ?? '—'}</span>,
  },
  {
    key: 'alan',
    header: 'Çalışma alanı',
    hideBelow: 'md',
    render: (r) => (
      <span className="text-sm text-muted-foreground">{r.workspace_name ?? '—'}</span>
    ),
  },
  {
    key: 'giris',
    header: 'Giriş',
    render: (r) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {formatRelativeTr(r.son_giris)}
      </span>
    ),
  },
  {
    key: 'ip',
    header: 'IP',
    hideBelow: 'md',
    render: (r) => (
      <span className="font-mono text-xs tabular-nums">
        {r.ip ?? <span className="font-sans text-muted-foreground">—</span>}
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

const suspiciousColumns: Column<SuspiciousRow>[] = [
  {
    key: 'kaynak',
    header: 'Kaynak',
    render: (r) => (
      <span className="font-mono text-xs tabular-nums">
        {r.ornek_ip ?? (
          <span className="font-sans text-muted-foreground">
            adres saklama süresi doldu
          </span>
        )}
      </span>
    ),
  },
  {
    key: 'hesap',
    header: 'Hesap',
    align: 'right',
    render: (r) => (
      <span className={r.hesap_sayisi > 1 ? 'font-semibold text-amber-600 dark:text-amber-500' : ''}>
        {r.hesap_sayisi}
      </span>
    ),
  },
  {
    key: 'basarisiz',
    header: 'Başarısız',
    align: 'right',
    render: (r) => (
      <span className={r.basarisiz > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'}>
        {r.basarisiz}
      </span>
    ),
  },
  {
    key: 'engellenen',
    header: 'Engellenen',
    align: 'right',
    hideBelow: 'sm',
    render: (r) => (
      <span className={r.engellenen > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'}>
        {r.engellenen}
      </span>
    ),
  },
  {
    key: 'basarili',
    header: 'Başarılı',
    align: 'right',
    hideBelow: 'md',
    render: (r) => <span className="text-muted-foreground">{r.basarili}</span>,
  },
  {
    key: 'ulke',
    header: 'Ülke',
    hideBelow: 'lg',
    render: (r) => <span className="text-sm text-muted-foreground">{r.ulkeler ?? '—'}</span>,
  },
  {
    key: 'son',
    header: 'Son hareket',
    render: (r) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {formatRelativeTr(r.son_olay)}
      </span>
    ),
  },
]

/**
 * Sayfalama — bağlantı olarak.
 *
 * Düğme değil BAĞLANTI: sayfa numarası adres çubuğunda durmalı ki
 * yönetici bir kaydı ekip arkadaşına gönderebilsin ve geri tuşu
 * beklendiği gibi çalışsın.
 */
function Pagination({
  page,
  pageCount,
  tur,
  q,
}: {
  page: number
  pageCount: number
  tur: string | null
  q: string
}) {
  const href = (p: number) => {
    const params = new URLSearchParams()
    if (tur) params.set('tur', tur)
    if (q) params.set('q', q)
    if (p > 1) params.set('sayfa', String(p))
    const qs = params.toString()
    return `/admin/guvenlik${qs ? `?${qs}` : ''}`
  }

  return (
    <nav
      className="flex items-center justify-between gap-3 pt-4 text-sm"
      aria-label="Sayfalar"
    >
      {page > 1 ? (
        <a className="text-primary underline-offset-4 hover:underline" href={href(page - 1)}>
          ← Önceki
        </a>
      ) : (
        <span className="text-muted-foreground">← Önceki</span>
      )}

      <span className="text-muted-foreground tabular-nums">
        Sayfa {page} / {pageCount}
      </span>

      {page < pageCount ? (
        <a className="text-primary underline-offset-4 hover:underline" href={href(page + 1)}>
          Sonraki →
        </a>
      ) : (
        <span className="text-muted-foreground">Sonraki →</span>
      )}
    </nav>
  )
}
