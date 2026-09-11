'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarPlus, ChevronLeft, ChevronRight, Pencil, Plus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Badge } from '@/components/ui/badge'
import { Section } from '@/components/shared/section'
import { EmptyState } from '@/components/shared/empty-state'
import {
  formatServiceAxes,
  formatServiceSchedule,
  formatSessionLong,
  formatSessionTime,
  effectiveSessionTime,
  isAwaitingOutcome,
  SESSION_STATUS_LABEL,
  SESSION_STATUS_VARIANT,
  WEEKDAY_LABEL,
  type SessionStatus,
  type Weekday,
} from '@/lib/service-structure'
import {
  createServiceAction,
  updateServiceAction,
  createMakeupSessionAction,
  createStudentGroupAction,
  moveActiveFlowDueAction,
  rescheduleSessionAction,
  setGroupSessionOutcomeAction,
  setMakeupDecisionAction,
  setSessionAttendanceAction,
  setServiceStatusAction,
  type ServiceUpdateInput,
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
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  // Aynı anda tek hizmet düzenlenir: iki açık form, hangi tarihin
  // hangi hizmete ait olduğunu belirsizleştirirdi.
  const [editingId, setEditingId] = useState<string | null>(null)

  // Referans an SUNUCUDAN gelir: istemcinin saati yanlışsa bile "geçti mi"
  // kararı herkeste aynı olsun.
  const now = new Date(nowIso)

  const serviceById = new Map(services.map((s) => [s.id, s]))

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
   * Hizmet düzenini ileri tarihten itibaren değiştirir (§5 no.7).
   *
   * KAÇ OTURUMUN DÜŞTÜĞÜ SÖYLENİR: değişiklik, eski desenle açılmış
   * ileri tarihli planlı oturumları siliyor. Öğretmen takvimde eksilen
   * satırları sonradan fark etmemeli.
   */
  function handleServiceUpdate(input: ServiceUpdateInput) {
    startTransition(async () => {
      const result = await updateServiceAction(input)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      const removed = result.removed ?? 0
      toast.success(
        removed > 0
          ? `Düzen güncellendi. Eski düzenle açılmış ${removed} ileri tarihli oturum kaldırıldı; yeni düzenle tekrar üretilecek.`
          : 'Düzen güncellendi.'
      )
      setEditingId(null)
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
      {/* ---------------- Hizmet Yapısı ---------------- */}
      <Section
        title="Hizmet Yapısı"
        description="Öğrenciye sunulan aktif hizmetler. Geçmiş kayıtlar etkilenmez."
        variant="card"
        action={
          <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
            <Plus className="size-4" />
            Hizmet Ekle
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

                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-3"
                  disabled={isPending}
                  onClick={() =>
                    run(
                      () =>
                        setServiceStatusAction(
                          studentId,
                          service.id,
                          service.status === 'active' ? 'passive' : 'active'
                        ),
                      service.status === 'active'
                        ? 'Hizmet pasife alındı.'
                        : 'Hizmet yeniden aktifleştirildi.'
                    )
                  }
                >
                  {service.status === 'active' ? 'Pasife Al' : 'Aktifleştir'}
                </Button>

                {/* Düzenleme yalnız AKTİF hizmette: pasif bir hizmetin
                    ileri tarihli oturumu zaten üretilmiyor, "şu tarihten
                    itibaren" demenin karşılığı yok. */}
                {service.status === 'active' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-3 ml-1"
                    disabled={isPending}
                    onClick={() =>
                      setEditingId((id) => (id === service.id ? null : service.id))
                    }
                  >
                    <Pencil className="size-4" />
                    {editingId === service.id ? 'Kapat' : 'Düzenle'}
                  </Button>
                )}

                {editingId === service.id && (
                  <ServiceEditForm
                    studentId={studentId}
                    service={service}
                    disabled={isPending}
                    onSubmit={handleServiceUpdate}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {showForm && (
          <ServiceForm
            studentId={studentId}
            groups={groups}
            disabled={isPending}
            onDone={() => setShowForm(false)}
            run={run}
          />
        )}
      </Section>

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
        {/* HİZMET BAZLI SAYAÇLAR (§3 no.3): "Grup 4/5", "Koçluk 3/4".
            Tek bir toplam, iki ayrı hizmet hattı olan öğrencide hangi
            hattın eksik kaldığını gizliyordu. */}
        {serviceCounters.length > 0 && (
          <ul className="mb-4 grid gap-2 sm:grid-cols-2">
            {serviceCounters.map((c) => {
              const service = serviceById.get(c.serviceId)
              if (!service) return null
              return (
                <li key={c.serviceId} className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate">{formatServiceAxes(service)}</span>
                    <span className="shrink-0 tabular-nums">
                      {c.done} / {c.planned}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {sessions.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title="Bu ayda planlanmış görüşme yok"
            description="Hizmet tanımlandığında ayın takviminden oturumlar otomatik üretilir."
          />
        ) : (
          <ul className="divide-y divide-border">
            {sessions.map((session) => {
              const service = serviceById.get(session.serviceId)
              const at = effectiveSessionTime(session)
              const awaiting = isAwaitingOutcome({ status: session.status, effectiveAt: at }, now)

              return (
                <li key={session.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {formatSessionTime(at)}
                      {session.isMakeup && (
                        <Badge variant="info" className="ml-2">
                          Telafi
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {service ? formatServiceAxes(service) : 'Hizmet bulunamadı'}
                      {/* İLK TAAHHÜT GÖRÜNÜR KALIR (§7.A): ertelenmiş
                          oturumda eski tarih silinmez, yanında yazar. */}
                      {session.actualAt && session.status === 'ertelendi' && (
                        <span> · İlk plan: {formatSessionTime(session.plannedAt)}</span>
                      )}
                    </p>
                  </div>

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
                </li>
              )
            })}
          </ul>
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
              bakmak on iki tıklama demekti. Satırlar doğrudan o aya
              atlıyor ve yanlarında ayın özeti duruyor — hangi aya
              gitmek gerektiği listede görünsün diye. */}
          <ul className="divide-y divide-border">
            {archive.map((m) => (
              <li key={m.param}>
                <Link
                  href={`?ay=${m.param}`}
                  className="flex items-baseline justify-between gap-3 py-2 text-sm hover:underline"
                >
                  <span>{m.label}</span>
                  <span className="shrink-0 text-muted-foreground">
                    <span className="tabular-nums">
                      {m.done} / {m.planned}
                    </span>
                    {m.missed > 0 && (
                      <span className="ml-2 text-warning-foreground">
                        {m.missed} yapılmadı
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
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

/**
 * Hizmet düzenini düzenleme formu — İLERİ TARİHLİ DEĞİŞİKLİK (§5 no.7).
 *
 * TÜR / KATILIM / GRUP ALANLARI YOK. Bu üç eksen hizmetin kimliğidir:
 * "birebir ders"in "grup koçluğu"na dönüşmesi düzenleme değil, başka
 * bir hizmettir — eskisi pasife alınır, yenisi eklenir. Formda
 * gösterilip RPC tarafından reddedilmeleri, kullanıcıyı çıkmaz bir
 * yola sokardı.
 *
 * "Şu tarihten itibaren" ALANI ZORUNLU VE AYRI: kaydedilen şey yalnız
 * yeni saat değil, değişikliğin NE ZAMAN başladığı. Varsayılanı bugün
 * yapmak geçmişi bozmaz (RPC kesimi NOW() ile koruyor) ama öğretmenin
 * "gelecek pazartesiden itibaren" demesinin de yolu açık kalır.
 */
function ServiceEditForm({
  studentId,
  service,
  disabled,
  onSubmit,
  onCancel,
}: {
  studentId: string
  service: ServiceRow
  disabled?: boolean
  onSubmit: (input: ServiceUpdateInput) => void
  onCancel: () => void
}) {
  const [weekday, setWeekday] = useState(String(service.weekday))
  const [startTime, setStartTime] = useState(service.startTime.slice(0, 5))
  const [duration, setDuration] = useState(String(service.plannedDurationMinutes))
  const [medium, setMedium] = useState(service.medium)
  const [financeLink, setFinanceLink] = useState(service.financeLink)
  const [effectiveFrom, setEffectiveFrom] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )

  return (
    <div className="mt-3 grid gap-3 rounded-md border border-border bg-muted/40 p-3 sm:grid-cols-2">
      <Field label="Gün">
        <NativeSelect value={weekday} onChange={(e) => setWeekday(e.target.value)}>
          {([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((d) => (
            <option key={d} value={d}>
              {WEEKDAY_LABEL[d]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="Saat">
        <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
      </Field>

      <Field label="Süre (dk)">
        <Input
          type="number"
          min={5}
          max={600}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
      </Field>

      <Field label="Ortam">
        <NativeSelect
          value={medium}
          onChange={(e) => setMedium(e.target.value as ServiceRow['medium'])}
        >
          <option value="online">Online</option>
          <option value="yuz_yuze">Yüz yüze</option>
        </NativeSelect>
      </Field>

      <Field label="Finans ilişkisi">
        <NativeSelect
          value={financeLink}
          onChange={(e) => setFinanceLink(e.target.value as ServiceRow['financeLink'])}
        >
          <option value="haric">Finansal takibe dahil değil</option>
          <option value="aylik_paket">Aylık pakete dahil</option>
          <option value="ders_basi">Ders/görüşme başı</option>
        </NativeSelect>
      </Field>

      <Field label="Şu tarihten itibaren">
        <Input
          type="date"
          value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
        />
      </Field>

      <p className="text-xs text-muted-foreground sm:col-span-2">
        Geçmiş kayıtlar değişmez. Bu tarihten sonraki, henüz sonuçlanmamış
        oturumlar yeni düzene göre yeniden üretilir.
      </p>

      <div className="flex items-end gap-2 sm:col-span-2">
        <Button
          size="sm"
          disabled={disabled}
          onClick={() =>
            onSubmit({
              studentId,
              serviceId: service.id,
              weekday,
              startTime,
              plannedDurationMinutes: duration,
              effectiveFrom,
              medium,
              submissionOffsetMinutes: service.submissionOffsetMinutes,
              financeLink,
            })
          }
        >
          Değişikliği Kaydet
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Vazgeç
        </Button>
      </div>
    </div>
  )
}

/**
 * Yeni hizmet formu.
 *
 * ÜÇ EKSEN AYRI SEÇİLİR (§5.3): Hizmet / Katılım / Ortam. Tek birleşik
 * liste ("Online Grup Ders", "Yüz Yüze Birebir Koçluk"...) sekiz seçenek
 * üretir ve yeni bir eksen eklendiğinde on altıya çıkardı.
 */
function ServiceForm({
  studentId,
  groups,
  disabled,
  onDone,
  run,
}: {
  studentId: string
  groups: { id: string; name: string }[]
  disabled?: boolean
  onDone: () => void
  run: (
    action: () => Promise<{ error?: string; success?: boolean }>,
    ok: string
  ) => void
}) {
  const [kind, setKind] = useState<'ders' | 'kocluk'>('ders')
  const [participation, setParticipation] = useState<'birebir' | 'grup'>('birebir')
  const [medium, setMedium] = useState<'online' | 'yuz_yuze'>('online')
  const [groupId, setGroupId] = useState('')
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [weekday, setWeekday] = useState('3')
  const [startTime, setStartTime] = useState('20:00')
  const [duration, setDuration] = useState('60')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [financeLink, setFinanceLink] = useState<ServiceRow['financeLink']>('haric')

  return (
    <div className="mt-4 grid gap-4 rounded-lg border border-border bg-muted/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Hizmet">
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as 'ders' | 'kocluk')}>
          <option value="ders">Ders</option>
          <option value="kocluk">Koçluk</option>
        </NativeSelect>
      </Field>

      <Field label="Katılım">
        <NativeSelect
          value={participation}
          onChange={(e) => setParticipation(e.target.value as 'birebir' | 'grup')}
        >
          <option value="birebir">Birebir</option>
          <option value="grup">Grup</option>
        </NativeSelect>
      </Field>

      <Field label="Ortam">
        <NativeSelect
          value={medium}
          onChange={(e) => setMedium(e.target.value as 'online' | 'yuz_yuze')}
        >
          <option value="online">Online</option>
          <option value="yuz_yuze">Yüz yüze</option>
        </NativeSelect>
      </Field>

      {participation === 'grup' && (
        <Field label="Grup">
          <NativeSelect value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Seçin</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
          {/* GRUP OLUŞTURMA BURADA (§5 no.4).

              Grup şimdiye kadar yalnız SEÇİLEBİLİYORDU; oluşturmanın
              arayüzde hiçbir yolu yoktu. Grup hizmeti tanımlamak isteyen
              öğretmen boş bir açılır listeye bakıyor ve devam
              edemiyordu. Form ayrı bir ekrana taşınmadı: ihtiyaç tam
              burada doğuyor. */}
          {newGroupOpen ? (
            <div className="mt-2 flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="newGroup" className="text-xs">
                  Yeni grup adı
                </Label>
                <Input
                  id="newGroup"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Örn. 12. Sınıf AYT Matematik Grubu"
                />
              </div>
              <Button
                size="sm"
                disabled={disabled || newGroupName.trim().length === 0}
                onClick={() =>
                  run(
                    () => createStudentGroupAction(studentId, newGroupName.trim()),
                    'Grup oluşturuldu.'
                  )
                }
              >
                Ekle
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNewGroupOpen(false)}>
                Vazgeç
              </Button>
            </div>
          ) : (
            <Button
              size="xs"
              variant="ghost"
              className="mt-1 -ml-1"
              onClick={() => setNewGroupOpen(true)}
            >
              <Plus className="size-3.5" />
              Yeni grup oluştur
            </Button>
          )}
        </Field>
      )}

      <Field label="Gün">
        <NativeSelect value={weekday} onChange={(e) => setWeekday(e.target.value)}>
          {([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((d) => (
            <option key={d} value={d}>
              {WEEKDAY_LABEL[d]}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="Saat">
        <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
      </Field>

      <Field label="Süre (dk)">
        <Input
          type="number"
          min={5}
          max={600}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
      </Field>

      <Field label="Başlangıç tarihi">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </Field>

      <Field label="Finans ilişkisi">
        <NativeSelect
          value={financeLink}
          onChange={(e) => setFinanceLink(e.target.value as ServiceRow['financeLink'])}
        >
          <option value="haric">Finansal takibe dahil değil</option>
          <option value="aylik_paket">Aylık pakete dahil</option>
          <option value="ders_basi">Ders/görüşme başı</option>
        </NativeSelect>
      </Field>

      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
        <Button
          disabled={disabled}
          onClick={() =>
            run(async () => {
              const result = await createServiceAction({
                studentId,
                kind,
                participation,
                medium,
                groupId: participation === 'grup' ? groupId : '',
                weekday,
                startTime,
                plannedDurationMinutes: duration,
                startDate,
                submissionOffsetMinutes: 0,
                financeLink,
              })
              if (result.success) onDone()
              return result
            }, 'Hizmet eklendi.')
          }
        >
          Hizmeti Ekle
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Vazgeç
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
