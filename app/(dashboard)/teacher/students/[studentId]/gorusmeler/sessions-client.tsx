'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarPlus, ChevronLeft, ChevronRight, Plus, Users } from 'lucide-react'
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
  createMakeupSessionAction,
  rescheduleSessionAction,
  setServiceStatusAction,
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
  isMakeup: boolean
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
  mainContactId: string | null
  mainContactLabel: string | null
  nextContactAt: string | null
  nextContactServiceId: string | null
  nowIso: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)

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
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() =>
                          run(
                            () => setSessionOutcomeAction(studentId, session.id, 'yapildi'),
                            'Görüşme yapıldı olarak işaretlendi.'
                          )
                        }
                      >
                        Yapıldı
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
                        onPick={(iso) =>
                          run(
                            () => rescheduleSessionAction(studentId, session.id, iso),
                            'Yeni tarih kaydedildi.'
                          )
                        }
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge variant={SESSION_STATUS_VARIANT[session.status]}>
                        {SESSION_STATUS_LABEL[session.status]}
                      </Badge>

                      {/* Telafi yalnız "Yapılmadı" sonrası anlamlıdır ve
                          asıl ayın borcunu kapatır (§7.C). */}
                      {session.status === 'yapilmadi' && !session.isMakeup && (
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
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Section>
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
          {groups.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Henüz grup yok. Grup hizmeti için önce bir grup tanımlanmalı.
            </p>
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
