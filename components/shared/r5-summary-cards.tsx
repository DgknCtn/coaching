import Link from 'next/link'
import { ArrowRight, BookOpen, ShieldCheck } from 'lucide-react'
import type { PoolSummaryItem, ResourcePlanSummary } from '@/lib/student-overview'

// R5 Öğrenci Genel Bakış — özet kartlar (R5.5 §7.1).
//
// AKADEMİK AKIŞ BURADAN ÇIKTI (R7/02 §2): yedi dersi iki sütunda
// gösteren ayrı ve geniş bir blok oldu — components/shared/
// academic-flow-card.tsx. Bu şeritte tek dersin "şu an / yaklaşan"
// ikilisine sıkışıyordu.
//
// Amaç R5'in TAMAMINI ana ekrana yığmak değil; üç sistemin NABZINI
// göstermek ve detay ekranlarına geçiş sağlamak.
//
// İKİ SINIR (§7.2):
//   - Yorumlayıcı risk/sağlık/düzen puanı ÜRETİLMEZ. Burada hiçbir yerde
//     "bu öğrenci geride" gibi bir yargı yok; yalnız sayı ve isim var.
//   - R5 verisi olmayan öğrencide ekran KIRILMAZ; nötr boş durum yazar.
//
// Mevcut R4 operasyon kartları (Açık Ödev / Onay Bekleyen / Süresi Geçen)
// bu bloktan BAĞIMSIZ yaşamaya devam eder — ayrı katman (OG-09).

interface Props {
  studentId: string
  resources: ResourcePlanSummary
  pool: { top: PoolSummaryItem[]; total: number }
}

export function R5SummaryCards({ studentId, resources, pool }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SummaryCard
        icon={BookOpen}
        title="Kaynak Planı"
        description="Atanmış kaynaklar ve plan ilerlemesi"
        href={`/teacher/students/${studentId}/goals`}
        linkLabel="Kaynak planını aç"
      >
        {resources.activeCount + resources.pendingCount + resources.completedCount === 0 ? (
          <Empty>Henüz kaynak atanmadı.</Empty>
        ) : (
          /* TEK TEK KİTAP LİSTESİ KALKTI (R7/02 §3).

             Belge: *"Genel Bakışta tek tek kitap isimleri gösterilmez.
             Öğrencide 30-40 kaynak olabilir; kartın görevi 'kaynak
             sistemi hedeflenen süre ve müfredat akışına göre sağlıklı
             mı?' sorusuna cevap vermektir."* Üç kitap gösterip
             gerisini saymak, otuz kaynaklı öğrencide karar vermeye
             yetmiyordu.

             İKİ PROBLEM AYRI TUTULUYOR (§3 son bölüm): plan temposu
             kitabın YIL/DÖNEM bitiş hedefini, müfredat uyumu ise
             akademik sırayı ölçer. Biri iyi diğeri kötü olabilir ve
             tek bir "sağlık" rakamına indirgemek ikisini de gizlerdi. */
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Tile value={resources.activeCount} label="aktif kaynak" />
              <Tile value={resources.mainCount} label="ana kaynak" />
              <Tile value={resources.completedCount} label="tamamlandı" />
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground">Plan temposu</p>
              <p className="text-sm">
                {resources.pace.onTrack} uyumlu · {resources.pace.behind} geride ·{' '}
                {resources.pace.notStarted} henüz başlamadı
              </p>
            </div>

            {/* ANA KAYNAK UYARILARDA ÖNCELİKLİ (§3): otuz kaynaklı bir
                öğrencide "3 kaynak geride" tek başına bir şey söylemez;
                hangi üçü olduğu söyler. */}
            {resources.mainCount > 0 && (
              <div className="space-y-1">
                {resources.mainBehindCount > 0 ? (
                  <p className="text-sm text-warning-foreground">
                    {resources.mainBehindCount} / {resources.mainCount} ana kaynak planın
                    gerisinde
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ana kaynakların hepsi planında
                  </p>
                )}

                {resources.mainBacklogCount > 0 && (
                  <p className="text-sm text-warning-foreground">
                    {resources.mainBacklogCount} ana kaynakta müfredat birikmesi var
                  </p>
                )}
              </div>
            )}

            {resources.pendingCount > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {resources.pendingCount} kaynak henüz planlanmadı.
              </p>
            )}
          </div>
        )}
      </SummaryCard>

      <SummaryCard
        icon={ShieldCheck}
        title="Koruma Havuzu"
        description="Uzun süredir temas edilmeyen konular"
        href={`/teacher/students/${studentId}/protection`}
        linkLabel="Koruma havuzunu aç"
      >
        {pool.total === 0 ? (
          <Empty>Havuzda konu yok.</Empty>
        ) : (
          <div className="space-y-2">
            {/* Kart bir nabız göstergesidir, liste değil: yalnız en eski
                birkaç konu görünür (OG-06). Tamamı detay ekranında. */}
            <ol className="space-y-1">
              {pool.top.map((t, i) => (
                <li key={t.topicId} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex min-w-0 gap-1.5">
                    <span className="tabular-nums text-muted-foreground">{i + 1}.</span>
                    <span className="truncate">{t.topicName}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {t.daysSinceContact} gün
                  </span>
                </li>
              ))}
            </ol>
            {pool.total > pool.top.length && (
              <p className="text-xs text-muted-foreground">
                +{pool.total - pool.top.length} konu daha
              </p>
            )}
          </div>
        )}
      </SummaryCard>
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  title,
  description,
  href,
  linkLabel,
  children,
}: {
  icon: typeof BookOpen
  title: string
  description: string
  href: string
  linkLabel: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-start gap-2.5">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        >
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="flex-1">{children}</div>

      <Link
        href={href}
        className="mt-3 inline-flex items-center gap-1 border-t pt-2 text-xs text-primary hover:underline"
      >
        {linkLabel}
        <ArrowRight className="size-3" />
      </Link>
    </section>
  )
}

// `PercentBar` BURADAN KALKTI: tek kullanıcısı kaynak başına Plan/Kitap
// yüzdelerini çizen satırdı ve o liste R7/02 §3 ile kaldırıldı
// ("Genel Bakışta tek tek kitap isimleri gösterilmez"). Yüzde çubukları
// Kaynak Planı ekranında yaşamaya devam ediyor.

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-md border py-2">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}
