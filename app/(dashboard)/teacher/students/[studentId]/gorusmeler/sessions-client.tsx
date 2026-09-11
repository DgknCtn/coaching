'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Settings2,
  Users,
  Wallet,
} from 'lucide-react'
import { formatKurus } from '@/lib/billing/pricing'
import {
  formatMinutes,
  monthPaymentLabel,
  monthPaymentState,
  parseLiraToKurus,
} from '@/lib/finance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ServiceStructureDrawer,
  type DrawerStudent,
} from './service-structure-drawer'
import { Badge } from '@/components/ui/badge'
import { Section } from '@/components/shared/section'
import { EmptyState } from '@/components/shared/empty-state'
import { MetricTiles } from '@/components/shared/metric-tiles'
import { ProgressBar } from '@/components/shared/progress-bar'
import {
  formatServiceAxes,
  formatServiceSchedule,
  formatSessionLong,
  formatSessionClock,
  formatSessionDate,
  formatSessionTime,
  formatSessionWeekdayShort,
  effectiveSessionTime,
  isAwaitingOutcome,
  SESSION_STATUS_LABEL,
  SESSION_STATUS_VARIANT,
  type SessionStatus,
  type Weekday,
} from '@/lib/service-structure'
import {
  createMakeupSessionAction,
  moveActiveFlowDueAction,
  rescheduleSessionAction,
  setGroupSessionOutcomeAction,
  setMakeupDecisionAction,
  setSessionAttendanceAction,
  resolvePaymentNoticeAction,
  setSessionOutcomeAction,
} from './actions'

export interface ServiceRow {
  id: string
  kind: 'ders' | 'kocluk'
  participation: 'birebir' | 'grup'
  medium: 'online' | 'yuz_yuze'
  groupId: string | null
  groupName: string | null
  weekday: Weekday
  startTime: string
  plannedDurationMinutes: number
  startDate: string
  submissionOffsetMinutes: number
  financeLink: 'aylik_paket' | 'ders_basi' | 'haric'
  status: 'active' | 'passive'
}

export interface SessionRow {
  id: string
  serviceId: string
  plannedAt: string
  actualAt: string | null
  durationMinutes: number | null
  status: SessionStatus
  attended: boolean | null
  note: string | null
  /** Grup oturumuysa ortak kaydın kimliği; birebirde null. */
  groupSessionId: string | null
  isMakeup: boolean
  /**
   * "Yapılmadı" sonrası telafi kararı (§7-C).
   * null = karar verilmedi, 'pending' = telafi bekliyor,
   * 'waived' = telafi edilmeyecek.
   */
  makeupDecision: 'pending' | 'waived' | null
  /** Telafiyse: asıl oturumun planlanan anı. */
  originPlannedAt: string | null
}

export interface SeasonSummary {
  birebirDersCount: number
  birebirDersMinutes: number
  grupDersCount: number
  grupDersMinutes: number
  koclukCount: number
  koclukMinutes: number
  totalCount: number
  totalMinutes: number
  /** null = finans tablolarını görme yetkisi yok (066: yalnız 'owner'). */
  accruedKurus: number | null
  collectedKurus: number | null
  balanceKurus: number | null
}

export interface ServiceCounter {
  serviceId: string
  planned: number
  done: number
}

export interface ArchiveMonth {
  param: string
  label: string
  planned: number
  done: number
  missed: number
  /** null = o ayın tahakkuku yok ya da finansı görme yetkisi yok (066). */
  finance: { accruedKurus: number; collectedKurus: number } | null
}

const FINANCE_LABEL: Record<ServiceRow['financeLink'], string> = {
  aylik_paket: 'Aylık pakete dahil',
  ders_basi: 'Ders/görüşme başı',
  haric: 'Finansal takibe dahil değil',
}

/**
 * Ders & Görüşmeler etkileşim katmanı.
 *
 * TASARIM KARARI — "DURUM GÜNCELLENMEDİ" BİR UYARI DEĞİL, BİR SORU.
 * Saati geçmiş ve hâlâ sonuçlandırılmamış oturum kırmızı bir hata gibi
 * gösterilmiyor; öğretmene üç işlem sunuluyor (Yapıldı · Yapılmadı ·
 * Tarihi Değiştir). Sistem otomatik "Yapılmadı" demediği için (§7.B)
 * ekranın işi karar vermek değil, kararı kolaylaştırmak.
 */
export function SessionsClient({
  studentId,
  services,
  sessions,
  groups,
  monthLabel,
  prevMonthParam,
  nextMonthParam,
  serviceCounters,
  archive,
  mainContactId,
  mainContactLabel,
  nextContactAt,
  nowIso,
  monthFinance,
  season,
  paymentNotice,
  student,
}: {
  studentId: string
  services: ServiceRow[]
  sessions: SessionRow[]
  groups: { id: string; name: string }[]
  monthLabel: string
  prevMonthParam: string
  nextMonthParam: string
  serviceCounters: ServiceCounter[]
  archive: ArchiveMonth[]
  mainContactId: string | null
  mainContactLabel: string | null
  nextContactAt: string | null
  nextContactServiceId: string | null
  nowIso: string
  /** Bu ayın tahakkuk/tahsilatı. null = finans satırlarını görme yetkisi yok. */
  monthFinance: { accruedKurus: number; collectedKurus: number; balanceKurus: number } | null
  season: SeasonSummary | null
  /** Bu ay için velinin bekleyen ödeme bildirimi. */
  paymentNotice: { id: string; note: string | null; createdAt: string } | null
  /** Hizmet Yapısı panelinin başlığında gösterilen kimlik. */
  student: DrawerStudent
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Hizmet yapısı sağdan açılan panelde düzenleniyor; formların kendi
  // durumu orada yaşıyor.
  const [structureOpen, setStructureOpen] = useState(false)

  // Referans an SUNUCUDAN gelir: istemcinin saati yanlışsa bile "geçti mi"
  // kararı herkeste aynı olsun.
  const now = new Date(nowIso)

  const serviceById = new Map(services.map((s) => [s.id, s]))

  // "5 grup dersi + 4 koçluk görüşmesi" — ayın VAADİ (§3 no.3).
  //
  // Planlanan sayıdan türer, yapılandan değil: cümle ayın başında ne
  // sözü verildiğini söylüyor, çubuklar ne kadarının tutulduğunu.
  const promiseLine =
    serviceCounters.length === 0
      ? null
      : serviceCounters
          .map((c) => {
            const service = serviceById.get(c.serviceId)
            if (!service) return null
            const noun =
              service.kind === 'kocluk'
                ? 'koçluk görüşmesi'
                : service.participation === 'grup'
                  ? 'grup dersi'
                  : 'birebir ders'
            return `${c.planned} ${noun}`
          })
          .filter(Boolean)
          .join(' + ')

  // HİÇBİR OTURUM GRUPLAMADA DÜŞMEZ.
  //
  // Kayıtlar hizmet başlıkları altında toplanıyor; hizmeti listede
  // olmayan bir oturum sessizce kaybolurdu. Normalde olamaz (hizmetler
  // aynı öğrencinin tamamı, durum süzgeci yok) ama "olamaz" varsayımıyla
  // veri gizlemek, ayın sayacıyla listenin ayrışması demek.
  const orphanSessions = sessions.filter((x) => !serviceById.has(x.serviceId))

  // Ödeme durumu ay bazında; tüm zamanların bakiyesi değil (§7 no.4).
  const paymentState = monthFinance ? monthPaymentState(monthFinance) : null
  const paymentLabel = monthPaymentLabel(paymentState)

  function run(action: () => Promise<{ error?: string; success?: boolean }>, ok: string) {
    startTransition(async () => {
      const result = await action()
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success(ok)
      router.refresh()
    })
  }

  /**
   * Grup oturumunu tek işlemle sonuçlandırır (§9).
   *
   * Kaç öğrenciye yansıdığı SÖYLENİR: sessiz bir fan-out, hiç
   * yansımadığını da sessiz bırakırdı — grup boşsa ya da bütün
   * hizmetler pasifse öğretmen bunu bilmeli.
   */
  function handleGroupOutcome(
    groupSessionId: string,
    status: 'yapildi' | 'yapilmadi' | 'iptal' | 'planlandi'
  ) {
    startTransition(async () => {
      const result = await setGroupSessionOutcomeAction(studentId, groupSessionId, status)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      const n = result?.affected ?? 0
      toast.success(
        n > 0
          ? `Grup oturumu güncellendi · ${n} öğrenciye yansıdı.`
          : 'Grup oturumu güncellendi ama hiçbir öğrenciye yansımadı (aktif hizmet yok).'
      )
      router.refresh()
    })
  }

  /**
   * Erteleme — ve ardından haftanın kapanışı sorusu (R7/05 kabul #11).
   *
   * Ayrı bir işleyici, çünkü `run` yalnız başarı/hata biliyor. Burada
   * üçüncü bir sonuç var: ertelenen oturum ANA TEMAS ise aktif akışın
   * son teslimi de taşınabilir — ama bu karar öğretmenindir. Sistem
   * kendiliğinden taşısaydı, öğretmenin koymadığı bir kapanış resmî
   * hâle gelirdi; hiç sormasaydı ders Pazar'dan Pazartesi'ye alınmışken
   * hafta hâlâ Pazar 10:00'da kapanırdı.
   */
  function handleReschedule(sessionId: string, iso: string) {
    startTransition(async () => {
      const result = await rescheduleSessionAction(studentId, sessionId, iso)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success('Yeni tarih kaydedildi.')

      const move = result?.moveDue
      if (move?.kind === 'locked') {
        // §4: özel son teslim seçilmişse otomatik değiştirme YOK —
        // yalnız hatırlatma.
        toast.info(
          `Haftanın son teslimi özel seçilmiş (${formatSessionLong(move.currentDueAt)}); ` +
            'ana temas değişikliği bu tarihi değiştirmedi.',
          { duration: 8000 }
        )
      } else if (move?.kind === 'ask') {
        const yes = window.confirm(
          'Ana temas taşındı. Aktif Haftalık Akış’ın son teslimi de taşınsın mı?\n\n' +
            `Şu an: ${formatSessionLong(move.currentDueAt)}\n` +
            `Yeni:  ${formatSessionLong(move.proposedDueAt)}`
        )
        if (yes) {
          const moved = await moveActiveFlowDueAction(
            studentId,
            move.flowId,
            move.proposedDueAt
          )
          if (moved?.error) toast.error(moved.error)
          else toast.success('Haftanın son teslimi de taşındı.')
        }
      }

      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* ---------------- Hizmet Yapısı · Bu Ayın Özeti ---------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
      {/* ÖZET BURADA, DÜZENLEME PANELDE (§5).

          Referans ekranda bu kart öğrencinin hizmetlerini bir bakışta
          gösteriyor; ekleme ve düzenleme sağdan açılan "Hizmet Yapısını
          Düzenle" panelinde. Formlar sayfa gövdesinde satır içi
          açıldığında aylık görüşme listesi ekranın çok altına düşüyor ve
          öğretmen düzeni değiştirirken tam da baktığı listeyi
          kaybediyordu. */}
      <Section
        title="Hizmet Yapısı"
        description="Öğrenciye sunulan aktif hizmetler. Geçmiş kayıtlar etkilenmez."
        variant="card"
        action={
          <Button size="sm" variant="outline" onClick={() => setStructureOpen(true)}>
            <Settings2 className="size-4" />
            Hizmet Yapısını Düzenle
          </Button>
        }
      >
        {mainContactLabel && (
          // ANA TEMAS ÖĞRETMENE SEÇTİRİLMEZ (§5). Kuralın kendisi burada
          // yazıyor ki "neden koçluk seçildi?" sorusu ekranda cevaplansın.
          <p className="mb-4 rounded-md border border-info-border bg-info-subtle px-3 py-2 text-sm text-info-foreground">
            Haftalık Akış ana teması otomatik belirlendi:{' '}
            <strong>{mainContactLabel}</strong>. Öncelik sırası Koçluk &gt; Birebir Ders &gt;
            Grup Dersi.
          </p>
        )}

        {services.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Henüz hizmet tanımlanmadı"
            description="Öğrencinin haftalık ders ve koçluk düzenini tanımlayın. Haftalık Akış bu düzenden beslenir."
            action={{ label: 'Hizmet Ekle', onClick: () => setStructureOpen(true) }}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {services.map((service) => (
              <li
                key={service.id}
                className="rounded-lg border border-border bg-card p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {formatServiceAxes(service)}
                      {service.groupName && (
                        <span className="text-muted-foreground"> · {service.groupName}</span>
                      )}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {formatServiceSchedule(service)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {FINANCE_LABEL[service.financeLink]}
                      {service.submissionOffsetMinutes > 0 &&
                        ` · Son teslim ${service.submissionOffsetMinutes / 60} saat önce`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {service.id === mainContactId && <Badge variant="info">Ana temas</Badge>}
                    <Badge variant={service.status === 'active' ? 'success' : 'neutral'}>
                      {service.status === 'active' ? 'Aktif' : 'Pasif'}
                    </Badge>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

        {/* BU AYIN HİZMET ÖZETİ (§3 no.3).

            Sayaçlar Hizmet Yapısı'nın YANINDA duruyor: soldaki kart
            "ne vaat ettik", sağdaki "ne kadarını verdik". Alt alta
            dizildiklerinde vaat ile gerçekleşme arasındaki fark
            kaydırma mesafesi kadar uzaklaşıyordu.

            ÇUBUK, ORANI BİR BAKIŞTA VERİR — ama sayı da yazıyor: "4/5"
            ile "3/4" arasındaki fark çubuk boyundan okunmaz. */}
        <Section
          title="Bu Ayın Hizmet Özeti"
          description={promiseLine ?? 'Bu ay için planlanmış hizmet yok.'}
          variant="card"
        >
          {serviceCounters.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Hizmet tanımlandığında ayın takviminden oturumlar otomatik üretilir.
            </p>
          ) : (
            <ul className="space-y-3">
              {serviceCounters.map((c) => {
                const service = serviceById.get(c.serviceId)
                if (!service) return null
                const percent = c.planned > 0 ? (c.done / c.planned) * 100 : 0
                return (
                  <li key={c.serviceId} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">
                        {service.groupName ?? formatServiceAxes(service)}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {c.done} / {c.planned} tamamlandı
                      </span>
                    </div>
                    <ProgressBar
                      value={percent}
                      tone={c.done >= c.planned ? 'success' : 'primary'}
                      label={`${formatServiceAxes(service)}: ${c.done} / ${c.planned}`}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </Section>
      </div>

      <ServiceStructureDrawer
        open={structureOpen}
        onOpenChange={setStructureOpen}
        student={student}
        services={services}
        groups={groups}
        mainContactId={mainContactId}
      />

      {/* ---------------- Aylık görüşme kayıtları ---------------- */}
      <Section
        title={`${monthLabel} Görüşme Kayıtları`}
        description={
          nextContactAt
            ? `Sıradaki temas: ${formatSessionTime(nextContactAt)}`
            : 'Planlanmış temas yok.'
        }
        variant="card"
        action={
          // Ay geçişi GERÇEK BAĞLANTI: paylaşılabilir ve geri tuşuyla
          // gezilebilir kalsın (link-tabs ile aynı gerekçe).
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" render={<Link href={`?ay=${prevMonthParam}`} />}>
              <ChevronLeft className="size-4" />
              <span className="sr-only">Önceki ay</span>
            </Button>
            <Button size="sm" variant="outline" render={<Link href={`?ay=${nextMonthParam}`} />}>
              <ChevronRight className="size-4" />
              <span className="sr-only">Sonraki ay</span>
            </Button>
          </div>
        }
      >
        {/* ÖDEME DURUMU (§7 no.4).

            Bu ekranda yalnız DURUM var, işlem yok: "Detay işlemler
            Finans ekranındadır." İki yerden para girilebilseydi
            hangisinin doğru olduğu sorusu geri gelirdi.

            Rozet YOKSA HİÇ ÇİZİLMEZ: aylık pakete dahil bir hizmette bu
            ayın tahakkuku sıfırdır ve "Tahsil edildi" yazmak yanıltır.
            Finansı görme yetkisi olmayan öğretmende de (066) aynı
            sessizlik. */}
        {/* VELİ BİLDİRİMİ (§8: "Veli 'Ödeme yaptım' bildirimi
            gönderebilir; öğretmen onaylayınca hesap kapanır").

            Bildirim para kaydı DEĞİL: onaylamak tek başına deftere satır
            yazmaz. Tutar girilirse tahsilat o anda doğar ve bunu yalnız
            çalışma alanı sahibi yapabilir. Öğretmen tutarsız da
            kapatabilir — parayı Finans ekranından zaten işlemiş
            olabilir. */}
        {paymentNotice && (
          <PaymentNoticeCard
            notice={paymentNotice}
            disabled={isPending}
            onResolve={(status, amountKurus) =>
              run(
                () =>
                  resolvePaymentNoticeAction(
                    studentId,
                    paymentNotice.id,
                    status,
                    amountKurus
                  ),
                status === 'confirmed' ? 'Bildirim onaylandı.' : 'Bildirim reddedildi.'
              )
            }
          />
        )}

        {paymentLabel && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={paymentState === 'paid' ? 'success' : 'warning'}>
              {paymentLabel}
            </Badge>
            <span className="text-muted-foreground tabular-nums">
              {formatKurus(monthFinance!.collectedKurus)} /{' '}
              {formatKurus(monthFinance!.accruedKurus)}
            </span>
            <Button size="xs" variant="ghost" render={<Link href="/teacher/finans" />}>
              Finans ekranı
            </Button>
          </div>
        )}

        {/* SAYAÇLAR BURADA DEĞİL: "Bu Ayın Hizmet Özeti" kartına
            taşındılar ve orada çubukla birlikte duruyorlar. Aynı
            "0 / 3" iki blok arayla iki kez yazıldığında, ikisinin
            farklı şeyleri sayıp saymadığı sorusu doğuyordu. */}

        {sessions.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title="Bu ayda planlanmış görüşme yok"
            description="Hizmet tanımlandığında ayın takviminden oturumlar otomatik üretilir."
          />
        ) : (
          /* KAYITLAR HİZMET BAZINDA AYRILIR (§7 hedef ekran).

             Tek düz liste, iki hizmet hattı olan öğrencide grup dersiyle
             koçluk görüşmesini iç içe gösteriyordu: "Çarşamba 20:00"
             satırının hangi hizmete ait olduğu ancak alt satırdaki
             küçük yazıdan anlaşılıyordu. Hizmet başlık olunca o bilgi
             satırdan çıkıyor ve tablo asıl soruya yer açıyor: hangi
             tarihte ne oldu.

             Sıra HİZMET YAPISI KARTIYLA AYNI (services dizisi): iki kart
             yan yana duruyor, farklı sıralarsa göz her seferinde eşleme
             yapmak zorunda kalır. */
          <div className="space-y-4">
            {services
              .map((service) => ({
                service,
                rows: sessions.filter((x) => x.serviceId === service.id),
              }))
              .filter((g) => g.rows.length > 0)
              .map(({ service, rows }) => {
                const counter = serviceCounters.find((c) => c.serviceId === service.id)
                return (
                  <div key={service.id} className="rounded-lg border border-border">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {formatServiceAxes(service)}
                          {service.groupName && (
                            <span className="text-muted-foreground"> · {service.groupName}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatServiceSchedule(service)}
                        </p>
                      </div>
                      {counter && (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {counter.done} / {counter.planned} tamamlandı
                        </span>
                      )}
                    </div>

                    {/* Tablo kendi kabında kayar; sayfa gövdesi yatay
                        kaymaz (dar ekran kuralı). */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs text-muted-foreground">
                            <th className="px-3 py-2 text-left font-medium">Tarih</th>
                            <th className="px-3 py-2 text-left font-medium">Gün</th>
                            <th className="px-3 py-2 text-left font-medium">Saat</th>
                            <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">
                              Süre
                            </th>
                            <th className="px-3 py-2 text-left font-medium">Durum</th>
                            <th className="hidden px-3 py-2 text-left font-medium md:table-cell">
                              Not
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((session) => {
                            const at = effectiveSessionTime(session)
                            const awaiting = isAwaitingOutcome(
                              { status: session.status, effectiveAt: at },
                              now
                            )

                            return (
                              <tr
                                key={session.id}
                                className="border-b border-border last:border-0 align-top"
                              >
                                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                                  {formatSessionDate(at)}
                                  {session.isMakeup && (
                                    <Badge variant="info" className="ml-1.5">
                                      Telafi
                                    </Badge>
                                  )}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                                  {formatSessionWeekdayShort(at)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                                  {formatSessionClock(at)}
                                </td>
                                <td className="hidden whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground sm:table-cell">
                                  {session.durationMinutes ?? service.plannedDurationMinutes} dk
                                </td>
                                <td className="px-3 py-2">
                      {awaiting ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-warning-foreground">
                            Durum güncellenmedi
                          </span>
                          {/* GRUP OTURUMUNDA "Yapıldı" TEK İŞLEM (§9).

                              Grup dersinde tek bir gerçek vardır; on öğrenci
                              için on ayrı "ders yapıldı mı" kararı olamaz.
                              Bu düğme gruptaki bütün aktif öğrencilere
                              yansır — "Katılmadı" istisnası olanlar hariç.
                              Önceden her öğrenci ekranı tek tek açılıyor ve
                              biri unutulduğunda aylık sayacı sessizce eksik
                              kalıyordu. */}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() =>
                              session.groupSessionId
                                ? handleGroupOutcome(session.groupSessionId, 'yapildi')
                                : run(
                                    () =>
                                      setSessionOutcomeAction(studentId, session.id, 'yapildi'),
                                    'Görüşme yapıldı olarak işaretlendi.'
                                  )
                            }
                          >
                            {session.groupSessionId ? 'Yapıldı (grup)' : 'Yapıldı'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() =>
                              run(
                                () => setSessionOutcomeAction(studentId, session.id, 'yapilmadi'),
                                'Görüşme yapılmadı olarak işaretlendi.'
                              )
                            }
                          >
                            Yapılmadı
                          </Button>
                          <RescheduleButton
                            disabled={isPending}
                            currentAt={at}
                            onPick={(iso) => handleReschedule(session.id, iso)}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge variant={SESSION_STATUS_VARIANT[session.status]}>
                            {SESSION_STATUS_LABEL[session.status]}
                          </Badge>

                          {/* TELAFİ KARARI (§7-C).

                              "Telafi bekliyor" ile "telafi edilmeyecek" aynı
                              `yapilmadi` durumuna düşüyordu; oysa ilki ayı
                              tamamlanmamış bırakır, ikincisi ayı 3/4 olarak
                              KAPATIR. Ayrım öğretmenin kararıdır ve veriden
                              türetilemez — bu yüzden soruluyor. */}
                          {session.status === 'yapilmadi' && !session.isMakeup && (
                            <>
                              {session.makeupDecision === 'waived' ? (
                                <span className="text-xs text-muted-foreground">
                                  Telafi edilmeyecek
                                </span>
                              ) : session.makeupDecision === 'pending' ? (
                                <span className="text-xs text-warning-foreground">
                                  Telafi bekliyor
                                </span>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    disabled={isPending}
                                    onClick={() =>
                                      run(
                                        () =>
                                          setMakeupDecisionAction(studentId, session.id, 'pending'),
                                        'Telafi bekliyor olarak işaretlendi.'
                                      )
                                    }
                                  >
                                    Telafi edilecek
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    disabled={isPending}
                                    onClick={() =>
                                      run(
                                        () =>
                                          setMakeupDecisionAction(studentId, session.id, 'waived'),
                                        'Telafi edilmeyecek olarak işaretlendi.'
                                      )
                                    }
                                  >
                                    Edilmeyecek
                                  </Button>
                                </div>
                              )}

                              {session.makeupDecision !== 'waived' && (
                                <RescheduleButton
                                  label="Telafi Ekle"
                                  disabled={isPending}
                                  currentAt={at}
                                  onPick={(iso) =>
                                    run(
                                      () => createMakeupSessionAction(studentId, session.id, iso),
                                      'Telafi oluşturuldu.'
                                    )
                                  }
                                />
                              )}
                            </>
                          )}

                          {/* KATILIM İSTİSNASI — yalnız grup oturumunda (§9).

                              Grup dersi YAPILDI ama bu öğrenci gelmedi.
                              Oturumu "Yapılmadı" işaretlemek yanlış olurdu:
                              ders gerçekleşti, öğretmen emeğini verdi; eksik
                              olan tek öğrencinin katılımı. Aylık sayaç bu
                              istisnayı zaten hesaba katıyor. */}
                          {session.groupSessionId && session.status === 'yapildi' && (
                            session.attended === false ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">Katılmadı</span>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  disabled={isPending}
                                  onClick={() =>
                                    run(
                                      () =>
                                        setSessionAttendanceAction(studentId, session.id, true),
                                      'Katılım kaydı geri alındı.'
                                    )
                                  }
                                >
                                  Geri al
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="xs"
                                variant="ghost"
                                disabled={isPending}
                                onClick={() =>
                                  run(
                                    () =>
                                      setSessionAttendanceAction(studentId, session.id, false),
                                    'Katılmadı olarak işaretlendi.'
                                  )
                                }
                              >
                                Katılmadı
                              </Button>
                            )
                          )}

                          {/* Telafi satırı HANGİ AYIN telafisi olduğunu yazar:
                              liste asıl aya göre süzüldüğü için satırın kendi
                              tarihi başka bir ayda olabilir (§7-C). */}
                          {session.isMakeup && session.originPlannedAt && (
                            <span className="text-xs text-muted-foreground">
                              {formatSessionTime(session.originPlannedAt)} telafisi
                            </span>
                          )}
                        </div>
                      )}
                                </td>
                                <td className="hidden px-3 py-2 text-xs text-muted-foreground md:table-cell">
                                  {/* İLK TAAHHÜT GÖRÜNÜR KALIR (§7.A):
                                      ertelenmiş oturumda eski tarih
                                      silinmez, notta yazar. */}
                                  {session.actualAt && session.status === 'ertelendi'
                                    ? `İlk plan: ${formatSessionTime(session.plannedAt)}`
                                    : (session.note ?? '—')}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}

            {orphanSessions.length > 0 && (
              <p className="rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-xs text-warning-foreground">
                {orphanSessions.length} kayıt, artık tanımlı olmayan bir hizmete
                bağlı ve yukarıdaki tablolarda görünmüyor. Aylık sayaçlar bu
                kayıtları içerir.
              </p>
            )}
          </div>
        )}
      </Section>

      {/* ---------------- Geçmiş aylar ---------------- */}
      {archive.length > 0 && (
        <Section
          title="Geçmiş Aylar"
          description="Aylık hizmet kayıtları silinmez; arşivlenir."
          variant="card"
        >
          {/* AY AY İLERİ GERİ GİTMEK YETMİYORDU: bir yıl öncesine
              bakmak on iki tıklama demekti. Ay adı doğrudan o aya
              atlıyor ve satırda ayın özeti duruyor — hangi aya gitmek
              gerektiği listede görünsün diye. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Ay</th>
                  <th className="px-3 py-2 text-right font-medium">Planlanan</th>
                  <th className="px-3 py-2 text-right font-medium">Yapılan</th>
                  <th className="px-3 py-2 text-left font-medium">Durum</th>
                </tr>
              </thead>
              <tbody>
                {archive.map((m) => {
                  const state = m.finance ? monthPaymentState(m.finance) : null
                  const label = monthPaymentLabel(state)
                  return (
                    <tr key={m.param} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <Link href={`?ay=${m.param}`} className="hover:underline">
                          {m.label}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.planned}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.done}</td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {/* TAHSİLAT ROZETİ VARSA ÇİZİLİR. Aylık pakete
                              dahil bir ayda tahakkuk sıfırdır ve
                              "Tahsil edildi" yazmak yanıltır; finansı
                              görme yetkisi olmayan öğretmende de (066)
                              aynı sessizlik. */}
                          {label && (
                            <Badge variant={state === 'paid' ? 'success' : 'warning'}>
                              {label}
                            </Badge>
                          )}
                          {m.missed > 0 && (
                            <span className="text-xs text-warning-foreground">
                              {m.missed} yapılmadı
                            </span>
                          )}
                          {!label && m.missed === 0 && (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ---------------- Sezon özeti (§9) ---------------- */}
      {season && season.totalCount > 0 && (
        <Section
          title="Sezon Özeti"
          description="Aktif eğitim döneminde gerçekleşen hizmetlerin toplamı."
          variant="card"
        >
          {/* DÖRT BAŞLIK KARO ŞERİDİ, KIRILIM ALTINDA (§9 hedef ekran).

              Dokümanın özet tablosu yedi gösterge sayıyor ama üçü
              (birebir / grup / koçluk) diğer dördünün kırılımı. Yedisini
              eşit ağırlıkta dizmek, "toplam temas" ile "grup dersi"ni
              aynı seviyede gösterip toplamı kaybettiriyordu.

              PARASAL KAROLAR KOŞULLU: finans 066'dan beri yalnız çalışma
              alanı sahibine açık. Yetkisi olmayan öğretmen oturum
              toplamlarını görmeye devam eder, para karosu hiç
              çizilmez. */}
          <MetricTiles
            className={season.accruedKurus !== null ? 'xl:grid-cols-4' : 'xl:grid-cols-2'}
            metrics={[
              { label: 'Toplam temas', value: season.totalCount, icon: Users },
              { label: 'Toplam süre', value: formatMinutes(season.totalMinutes), icon: Clock },
              ...(season.accruedKurus !== null
                ? [
                    {
                      label: 'Toplam tahakkuk',
                      value: formatKurus(season.accruedKurus),
                      icon: Wallet,
                    },
                    {
                      label: 'Tahsil edilen',
                      value: formatKurus(season.collectedKurus ?? 0),
                      icon: Wallet,
                      tone:
                        (season.balanceKurus ?? 0) > 0
                          ? ('warning' as const)
                          : ('success' as const),
                      hint:
                        (season.balanceKurus ?? 0) > 0
                          ? `${formatKurus(season.balanceKurus ?? 0)} kaldı`
                          : undefined,
                    },
                  ]
                : []),
            ]}
          />

          <dl className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <SeasonStat
              label="Birebir ders"
              count={season.birebirDersCount}
              minutes={season.birebirDersMinutes}
              unit="oturum"
            />
            <SeasonStat
              label="Grup dersi"
              count={season.grupDersCount}
              minutes={season.grupDersMinutes}
              unit="oturum"
            />
            <SeasonStat
              label="Koçluk"
              count={season.koclukCount}
              minutes={season.koclukMinutes}
              unit="görüşme"
            />
          </dl>
        </Section>
      )}
    </div>
  )
}

/**
 * Velinin bekleyen ödeme bildirimi.
 *
 * TUTAR ALANI BOŞ BAŞLAR VE ZORUNLU DEĞİL. Velinin söylediği rakam
 * yok (bildirim tutar taşımıyor); buraya yazılan sayı öğretmenin kendi
 * beyanı ve yazıldığı anda tahsilat satırı doğuruyor. Varsayılan bir
 * değer koymak — örneğin ayın tahakkuku — öğretmenin bakmadan
 * onaylamasına ve gerçekte gelmemiş bir parayı deftere geçirmesine yol
 * açardı.
 */
function PaymentNoticeCard({
  notice,
  disabled,
  onResolve,
}: {
  notice: { id: string; note: string | null; createdAt: string }
  disabled?: boolean
  onResolve: (status: 'confirmed' | 'rejected', amountKurus: number | null) => void
}) {
  const [amount, setAmount] = useState('')

  return (
    <div className="mb-4 rounded-lg border border-info-border bg-info-subtle p-3 text-sm">
      <p className="font-medium text-info-foreground">
        Veli bu ay için ödeme yaptığını bildirdi.
      </p>
      {notice.note && (
        <p className="mt-1 text-info-foreground/90">&ldquo;{notice.note}&rdquo;</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {formatSessionTime(notice.createdAt)}
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Label htmlFor="noticeAmount" className="text-xs">
            Tahsil edilen tutar <span className="text-muted-foreground">(isteğe bağlı)</span>
          </Label>
          <Input
            id="noticeAmount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Örn. 12000"
          />
        </div>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => {
            // Boş bırakılırsa yalnız bildirim kapanır, defter
            // değişmez.
            const kurus = amount.trim() === '' ? null : parseLiraToKurus(amount)
            if (amount.trim() !== '' && kurus === null) {
              toast.error('Geçerli bir tutar girin.')
              return
            }
            onResolve('confirmed', kurus)
          }}
        >
          Onayla
        </Button>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onResolve('rejected', null)}>
          Reddet
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Tutar girilirse Finans ekranına tahsilat olarak işlenir. Boş bırakılırsa
        yalnız bildirim kapanır.
      </p>
    </div>
  )
}

/**
 * Sezon özetinin tek göstergesi.
 *
 * SAYI VE SÜRE BİRLİKTE (§9: "36 oturum · 60 saat"). Yalnız sayı,
 * 30 dakikalık koçluklarla 90 dakikalık dersleri eşitlerdi.
 */
function SeasonStat({
  label,
  count,
  minutes,
  unit,
}: {
  label: string
  count: number
  minutes: number
  unit: string
}) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">
        {count} {unit}
        {count > 0 && (
          <span className="font-normal text-muted-foreground"> · {formatMinutes(minutes)}</span>
        )}
      </dd>
    </div>
  )
}

/**
 * Tarih/saat seçtiren küçük satır içi form.
 *
 * `datetime-local` YEREL duvar saatiyle çalışır ve tam da istediğimiz
 * budur: öğretmen "20:00" yazar, tarayıcı bunu kendi bölgesinde yorumlar.
 * Sunucuya ISO olarak gider.
 */
function RescheduleButton({
  currentAt,
  onPick,
  disabled,
  label = 'Tarihi Değiştir',
}: {
  currentAt: Date
  onPick: (iso: string) => void
  disabled?: boolean
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(() => toLocalInputValue(currentAt))

  if (!open) {
    return (
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-52"
        aria-label={label}
      />
      <Button
        size="sm"
        disabled={disabled || !value}
        onClick={() => {
          onPick(new Date(value).toISOString())
          setOpen(false)
        }}
      >
        Kaydet
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Vazgeç
      </Button>
    </div>
  )
}

/** `datetime-local` alanının beklediği yerel biçim. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
