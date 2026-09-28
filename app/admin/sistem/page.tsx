import type { Metadata } from 'next'
import { Activity, Database, HardDrive, Timer } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { SectionUnavailable } from '@/components/shared/section-unavailable'
import { Badge } from '@/components/ui/badge'
import { KpiCard } from '@/components/admin/kpi-card'
import { createClient } from '@/lib/supabase/server'
import { formatDateTr, formatRelativeTr } from '@/lib/format'
import { formatBytes, type SystemStatus } from '@/lib/admin/types'
import { GET as healthCheck } from '@/app/api/health/route'

export const metadata: Metadata = { title: 'Sistem' }
export const dynamic = 'force-dynamic'

// ============================================================
// SİSTEM — "altyapı sağlam mı?"
//
// Sağlık: /api/health'in KENDİSİ çağrılıyor (HTTP değil, aynı işlev) —
// izleme servisinin gördüğü sonuçla birebir aynı.
// Veritabanı, tablolar, cron çalışmaları: admin_system_status (124).
//
// OKUNAMAYANLAR AÇIKÇA SÖYLENİR: gece yedekleri ayrı bir GitHub
// deposunda (Releases); uygulama oraya erişmiyor. Açık PERF/SEC kalemleri
// depodaki belgelerde; belge sunucuya dağıtılmıyor. Görünmeyen bir şeyi
// "yeşil" göstermek, göstermemekten kötüdür.
// ============================================================

interface Health {
  status: 'ok' | 'degraded' | 'down'
  database: string
  latencyMs: number
}

const JOB_LABEL: Record<string, string> = {
  'purge-auth-events': 'Giriş kayıtlarında 90 günlük temizlik',
  hatirlatmalar: 'Deneme ve lisans hatırlatma e-postaları',
}

export default async function AdminSystem() {
  const supabase = await createClient()

  const [healthRes, systemRes] = await Promise.all([
    healthCheck().then((r) => r.json() as Promise<Health>).catch(() => null),
    supabase.rpc('admin_system_status'),
  ])
  const health = healthRes
  const system = systemRes.error ? null : (systemRes.data as unknown as SystemStatus)
  const lastPurge = system?.cron.find((c) => c.job === 'purge-auth-events') ?? null
  const purgeStale =
    !lastPurge || new Date(lastPurge.started_at).getTime() < Date.now() - 2 * 86_400_000

  return (
    <div className="space-y-8">
      <PageHeader
        title="Sistem"
        subtitle="Sağlık, veritabanı, zamanlanmış işler ve yedekler"
        className="mb-0"
      />

      <Section title="Durum">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Sağlık kontrolü"
            value={health ? (health.status === 'ok' ? 'Çalışıyor' : 'Sorunlu') : 'Yanıt yok'}
            hint={health ? `veritabanı ${health.database} · ${health.latencyMs} ms` : '/api/health çağrılamadı'}
            icon={Activity}
            tone={health?.status === 'ok' ? 'default' : 'destructive'}
          />
          <KpiCard
            label="Veritabanı boyutu"
            value={system ? formatBytes(system.db_bytes) : '—'}
            icon={Database}
          />
          <KpiCard
            label="Saklama temizliği"
            value={lastPurge ? formatRelativeTr(lastPurge.started_at) : system ? 'hiç çalışmadı' : '—'}
            hint={
              system
                ? system.purge_overdue > 0
                  ? `${system.purge_overdue} kayıt gecikmiş`
                  : 'gecikmiş kayıt yok'
                : undefined
            }
            icon={Timer}
            tone={
              system && (system.purge_overdue > 0 || lastPurge?.ok === false)
                ? 'destructive'
                : system && purgeStale
                  ? 'warning'
                  : 'default'
            }
          />
          <KpiCard
            label="Hız sınırı sayaçları"
            value={system ? system.rate_limit_rows : '—'}
            hint="rate_limit_counters satırı"
            icon={HardDrive}
          />
        </div>
      </Section>

      <Section
        title="Zamanlanmış işler"
        description="Son 20 çalışma (cron_runs, 122). Temizlik her gece çalışır; 48 saatten eskiyse dikkat."
        variant="card"
      >
        {!system ? (
          <div className="p-4">
            <SectionUnavailable title="Sistem durumu alınamadı" retryHref="/admin/sistem" />
          </div>
        ) : system.cron.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Henüz kayıtlı çalışma yok. Cron ilk kez çalıştığında burada görünür.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">İş</th>
                  <th className="px-4 py-2 font-medium">Zaman</th>
                  <th className="px-4 py-2 font-medium">Sonuç</th>
                  <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Etkilenen</th>
                </tr>
              </thead>
              <tbody>
                {system.cron.map((c) => (
                  <tr key={`${c.job}-${c.started_at}`} className="border-b last:border-0">
                    <td className="px-4 py-2">{JOB_LABEL[c.job] ?? c.job}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatRelativeTr(c.started_at)}</td>
                    <td className="px-4 py-2">
                      {c.ok === true ? (
                        <Badge variant="success">Başarılı</Badge>
                      ) : c.ok === false ? (
                        <span className="flex flex-col gap-0.5">
                          <Badge variant="destructive">Başarısız</Badge>
                          {c.error && <span className="text-xs text-muted-foreground">{c.error}</span>}
                        </span>
                      ) : (
                        <Badge variant="neutral">Sürüyor</Badge>
                      )}
                    </td>
                    <td className="hidden px-4 py-2 text-right tabular-nums sm:table-cell">
                      {c.affected ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {system && (
        <Section title="En büyük tablolar" description="Dizinler dahil; satır sayısı istatistikten (yaklaşık)" variant="card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Tablo</th>
                <th className="px-4 py-2 text-right font-medium">Boyut</th>
                <th className="px-4 py-2 text-right font-medium">Satır</th>
              </tr>
            </thead>
            <tbody>
              {system.tables.map((t) => (
                <tr key={t.name} className="border-b last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{t.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatBytes(t.bytes)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {t.rows.toLocaleString('tr-TR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Buradan okunamayanlar" variant="card">
        <dl className="divide-y text-sm">
          <div className="grid gap-1 p-4 sm:grid-cols-[12rem_1fr]">
            <dt className="font-medium">Yedekler</dt>
            <dd className="text-muted-foreground">
              Her gece 03:00&apos;te (TRT) şifreli yedek, <code className="text-xs">DgknCtn/coaching-yedek</code>{' '}
              deposunun Releases bölümüne yazılır; 30 gün saklanır. Uygulama o depoya erişmediği için son
              yedeğin başarılı olup olmadığı burada <strong>görünmez</strong> — o deponun Releases
              listesinde son tarihli yedeğe bakılmalı. Geri yükleme adımları:{' '}
              <code className="text-xs">docs/production-readiness/yedek-geri-yukleme.md</code>
            </dd>
          </div>
          <div className="grid gap-1 p-4 sm:grid-cols-[12rem_1fr]">
            <dt className="font-medium">Açık PERF/SEC kalemleri</dt>
            <dd className="text-muted-foreground">
              Depodaki <code className="text-xs">docs/production-readiness/prd-durumu.md</code> belgesinde
              izlenir; belge sunucuya dağıtılmadığı için burada listelenmiyor.
            </dd>
          </div>
        </dl>
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          Sayfa oluşturuldu: {formatDateTr(new Date().toISOString())}
        </p>
      </Section>
    </div>
  )
}
