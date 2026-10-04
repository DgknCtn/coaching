import type { Metadata } from 'next'
import Link from 'next/link'
import { GraduationCap, HeartHandshake, Users } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { SectionUnavailable } from '@/components/shared/section-unavailable'
import { DataTable, type Column } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { KpiCard } from '@/components/admin/kpi-card'
import { WindowPicker, parseWindow } from '@/components/admin/window-picker'
import { createClient } from '@/lib/supabase/server'
import { listResult } from '@/lib/data-result'
import { formatRelativeTr } from '@/lib/format'
import type { TeacherActivity, UserCounts } from '@/lib/admin/types'
import { CleanupButton } from '../cleanup-button'

/** 136 · admin_list_users — hesap temizliği listesi (yalnız kimlik ve rol). */
interface AccountRow {
  profile_id: string
  full_name: string | null
  email: string | null
  roles: string[]
  owned_workspaces: number
  is_platform_admin: boolean
  is_partner: boolean
  created_at: string
  last_sign_in_at: string | null
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Sahip',
  teacher: 'Öğretmen',
  assistant: 'Asistan',
  student: 'Öğrenci',
  parent: 'Veli',
}

export const metadata: Metadata = { title: 'Kullanıcılar' }
export const dynamic = 'force-dynamic'

// ============================================================
// KULLANICILAR — "kimler aktif?"
//
// Öğretmen ADIYLA (müşteri = öğretmen); öğrenci ve veli YALNIZ SAYI.
// Kısıt fonksiyonlarda (124): admin_teacher_activity öğrenci adı
// döndürmüyor, admin_user_counts yalnız sayı.
//
// Aktif: son N günde başarılı giriş. Google ve PIN girişleri 27 Eylül
// 2026'dan önce kaydedilmiyordu; o tarihten eski hesaplarda "kayıt yok"
// girişin olmadığını değil, kaydın olmadığını söyler.
// ============================================================

const DAY = 86_400_000

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ gun?: string; q?: string; hesap?: string }>
}) {
  const sp = await searchParams
  const days = parseWindow(sp.gun, 30)
  const q = sp.q?.trim().slice(0, 100) || null
  const accountQ = sp.hesap?.trim().slice(0, 100) || null
  const supabase = await createClient()

  const [countsRes, teachersRes, accountsRes] = await Promise.all([
    supabase.rpc('admin_user_counts'),
    supabase.rpc('admin_teacher_activity', { p_days: days, p_search: q, p_limit: 300 }),
    supabase.rpc('admin_list_users', { p_search: accountQ, p_limit: 200 }),
  ])
  const accountsR = listResult(accountsRes, 'admin.list_users')
  const accounts = (accountsR.ok ? accountsR.data : []) as unknown as AccountRow[]
  const countsR = listResult(countsRes, 'admin.user_counts')
  const teachersR = listResult(teachersRes, 'admin.teacher_activity')
  const counts = countsR.ok ? (countsR.data[0] as unknown as UserCounts) : null
  const teachers = (teachersR.ok ? teachersR.data : []) as unknown as TeacherActivity[]

  const windowLabel = days === 365 ? 'son 1 yıl' : `son ${days} gün`
  const now = Date.now()

  const columns: Column<TeacherActivity>[] = [
    {
      key: 'name',
      header: 'Öğretmen',
      render: (t) => {
        const stale = !t.last_login_at || now - new Date(t.last_login_at).getTime() >= 7 * DAY
        return (
          <div className="min-w-0">
            <p className="truncate font-medium">{t.teacher_name ?? '—'}</p>
            {t.teacher_email && (
              <p className="truncate text-xs text-muted-foreground">{t.teacher_email}</p>
            )}
            {stale && (
              <Badge variant="warning" className="mt-1">
                7 gündür giriş yok
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      key: 'workspace',
      header: 'Çalışma alanı',
      hideBelow: 'md',
      render: (t) => (
        <Link
          href={`/admin/calisma-alanlari/${t.workspace_id}`}
          className="underline-offset-4 hover:underline"
        >
          {t.workspace_name}
        </Link>
      ),
    },
    {
      key: 'login',
      header: 'Son giriş',
      hideBelow: 'sm',
      render: (t) => (
        <div>
          <p className="text-muted-foreground">
            {t.last_login_at ? formatRelativeTr(t.last_login_at) : 'kayıt yok'}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">{t.logins} giriş</p>
        </div>
      ),
    },
    { key: 'hw', header: 'Ödev', align: 'right', render: (t) => <span className="tabular-nums">{t.homework_published}</span> },
    { key: 'ap', header: 'Onay', align: 'right', render: (t) => <span className="tabular-nums">{t.approvals}</span> },
    {
      key: 'ses',
      header: 'Görüşme',
      align: 'right',
      hideBelow: 'lg',
      render: (t) => <span className="tabular-nums">{t.sessions_marked}</span>,
    },
    {
      key: 'st',
      header: 'Teslim eden öğrenci',
      align: 'right',
      hideBelow: 'lg',
      render: (t) => <span className="tabular-nums">{t.active_students}</span>,
    },
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="Kullanıcılar"
          subtitle="Öğretmenler adıyla; öğrenci ve veli yalnız sayı olarak"
          className="mb-0"
        />
        <WindowPicker basePath="/admin/kullanicilar" value={days} extra={{ q: q ?? undefined }} />
      </div>

      <Section title="Sayılar" description="Aktif: son 7 / 30 günde giriş yapan (öğrencide ayrıca teslim eden)">
        {counts ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard
              label="Öğretmen"
              value={counts.teachers}
              hint={`${counts.active_teachers_7d} aktif (7 gün) · ${counts.active_teachers_30d} (30 gün)`}
              icon={GraduationCap}
            />
            <KpiCard
              label="Öğrenci"
              value={counts.students}
              hint={`${counts.students_with_account} hesaplı · ${counts.active_students_7d} aktif (7 gün) · ${counts.active_students_30d} (30 gün)`}
              icon={Users}
            />
            <KpiCard
              label="Veli"
              value={counts.parents}
              hint={`${counts.active_parents_7d} aktif (7 gün) · ${counts.active_parents_30d} (30 gün)`}
              icon={HeartHandshake}
            />
          </div>
        ) : (
          <SectionUnavailable title="Kullanıcı sayıları alınamadı" retryHref="/admin/kullanicilar" />
        )}
      </Section>

      <Section
        title="Öğretmenler"
        description={`Sayılar ${windowLabel} için. Son girişe göre sıralı.`}
        variant="card"
      >
        <form method="get" className="flex flex-wrap items-center gap-2 border-b p-3">
          <input type="hidden" name="gun" value={days} />
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Ad, e-posta ya da çalışma alanı ara…"
            aria-label="Öğretmen ara"
            className="h-9 w-full max-w-xs rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <button
            type="submit"
            className="h-9 rounded-md border border-input bg-card px-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            Ara
          </button>
          {q && (
            <Link
              href={`/admin/kullanicilar?gun=${days}`}
              className="px-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Temizle
            </Link>
          )}
        </form>
        {teachersR.ok ? (
          <DataTable
            columns={columns}
            rows={teachers}
            rowKey={(t) => t.profile_id}
            empty={{
              icon: GraduationCap,
              title: q ? 'Eşleşen öğretmen yok' : 'Henüz öğretmen yok',
            }}
          />
        ) : (
          <div className="p-4">
            <SectionUnavailable title="Öğretmen listesi alınamadı" retryHref="/admin/kullanicilar" />
          </div>
        )}
      </Section>

      {/* HESAP TEMİZLİĞİ (136): test hesaplarını tek tek silmek için.
          Sahibi olduğu alanı kalan ya da başka alanlarda kaydı bulunan
          hesap silinemez; önizleme nedenini söyler. Öğrencinin akademik
          verisi burada YOK — yalnız kimlik ve rol. */}
      <Section
        title="Hesap temizliği"
        description="Tüm hesaplar (öğretmen, öğrenci, veli, partner). Önce hesabın sahibi olduğu çalışma alanlarını silin."
        variant="card"
      >
        <form method="get" className="flex flex-wrap items-center gap-2 border-b p-3">
          <input type="hidden" name="gun" value={days} />
          {q && <input type="hidden" name="q" value={q} />}
          <input
            type="search"
            name="hesap"
            defaultValue={accountQ ?? ''}
            placeholder="Ad ya da e-posta ara…"
            aria-label="Hesap ara"
            className="h-9 w-full max-w-xs rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <button
            type="submit"
            className="h-9 rounded-md border border-input bg-card px-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            Ara
          </button>
        </form>
        {accountsR.ok ? (
          <DataTable
            columns={[
              {
                key: 'who',
                header: 'Hesap',
                render: (a: AccountRow) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {a.full_name ?? <span className="text-muted-foreground">Ad gizli (öğrenci/veli)</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{a.email ?? '—'}</p>
                  </div>
                ),
              },
              {
                key: 'roles',
                header: 'Rol',
                render: (a: AccountRow) => (
                  <span className="flex flex-wrap gap-1">
                    {a.is_platform_admin && <Badge variant="info">Yönetici</Badge>}
                    {a.is_partner && <Badge variant="neutral">Partner</Badge>}
                    {a.roles.map((r) => (
                      <Badge key={r} variant="neutral">
                        {ROLE_LABEL[r] ?? r}
                      </Badge>
                    ))}
                    {!a.is_platform_admin && !a.is_partner && a.roles.length === 0 && (
                      <span className="text-xs text-muted-foreground">üyelik yok</span>
                    )}
                  </span>
                ),
              },
              {
                key: 'owned',
                header: 'Sahibi olduğu alan',
                align: 'right',
                hideBelow: 'md',
                render: (a: AccountRow) => <span className="tabular-nums">{a.owned_workspaces}</span>,
              },
              {
                key: 'login',
                header: 'Son giriş',
                hideBelow: 'sm',
                render: (a: AccountRow) => (
                  <span className="text-muted-foreground">
                    {a.last_sign_in_at ? formatRelativeTr(a.last_sign_in_at) : 'hiç'}
                  </span>
                ),
              },
              {
                key: 'action',
                header: '',
                align: 'right',
                render: (a: AccountRow) =>
                  a.is_platform_admin ? null : (
                    <CleanupButton kind="user" id={a.profile_id} label="Sil" size="xs" />
                  ),
              },
            ]}
            rows={accounts}
            rowKey={(a) => a.profile_id}
            empty={{ icon: Users, title: accountQ ? 'Eşleşen hesap yok' : 'Hesap yok' }}
          />
        ) : (
          <div className="p-4">
            <SectionUnavailable title="Hesap listesi alınamadı" retryHref="/admin/kullanicilar" />
          </div>
        )}
      </Section>
    </div>
  )
}
