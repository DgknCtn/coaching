'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  WEEKDAY_LABEL,
  formatServiceAxes,
  type Weekday,
} from '@/lib/service-structure'
import {
  createServiceAction,
  createStudentGroupAction,
  setServiceStatusAction,
  updateServiceAction,
  type ServiceUpdateInput,
} from './actions'
import type { ServiceRow } from './sessions-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { AlertBanner } from '@/components/shared/alert-banner'
import { EmptyState } from '@/components/shared/empty-state'
import { SegmentedField } from '@/components/shared/segmented-field'

/**
 * HİZMET YAPISINI DÜZENLE — sağdan açılan ayar katmanı (R7-04 Rev.3 §5).
 *
 * ============================================================
 * NEDEN AYRI BİR EKRAN DEĞİL, PANEL
 * ============================================================
 * Referans dokümanın kendi cümlesi: *"Hizmet Yapısı ayrı bir ana menü
 * değildir. Öğrencinin gelecekte hangi hizmetleri, hangi düzende
 * alacağını tanımlayan ayar katmanıdır."*
 *
 * Ayrı bir rota olsaydı öğretmen düzeni değiştirmek için aylık görüşme
 * kaydından çıkmak zorunda kalırdı — oysa değişiklik kararını tam da o
 * listeye bakarken veriyor ("bu ay üçünü de kaçırdık, saati değiştirelim").
 * Panel açıkken arkadaki ay listesi görünür kalıyor.
 *
 * Formlar bu dosyaya TAŞINDI, yeniden yazılmadı: `sessions-client.tsx`
 * içinde satır içi açılıyorlardı ve sayfa gövdesini iki katına
 * çıkarıyorlardı. Sunucu eylemleri aynen kullanılıyor.
 *
 * ============================================================
 * MOCKUP'TAKİ ÜÇ ALAN BİLİNÇLİ OLARAK YOK
 * ============================================================
 * Hedef görselde "Ders / Kapsam" (branş), "Tekrar: Haftalık" ve
 * "100 – 120 dk" biçiminde bir süre ARALIĞI var. Üçünün de veri
 * modelinde karşılığı yok (`student_services`: tek `weekday`, tek
 * `start_time`, tek `planned_duration_minutes`).
 *
 * Boş kutu olarak çizmek, doldurulabilecekleri izlenimi verirdi;
 * doldurulan değer hiçbir yere yazılmaz ve öğretmen kaydettiğini
 * sanırdı. Alan, verisi geldiğinde eklenir.
 */

/** Panelin okuduğu tek kimlik bilgisi — bağlam kaybolmasın diye başlıkta. */
export interface DrawerStudent {
  id: string
  name: string
  /** "Mezun · YKS" gibi; yoksa satır hiç çizilmez. */
  meta: string | null
}

const FINANCE_OPTIONS = [
  { value: 'aylik_paket' as const, label: 'Aylık pakete dahil' },
  { value: 'ders_basi' as const, label: 'Ders/görüşme başı' },
  { value: 'haric' as const, label: 'Takip dışı' },
]

const MEDIUM_LABEL: Record<ServiceRow['medium'], string> = {
  online: 'Online',
  yuz_yuze: 'Yüz yüze',
}

const FINANCE_LABEL: Record<ServiceRow['financeLink'], string> = {
  aylik_paket: 'Aylık pakete dahil',
  ders_basi: 'Ders/görüşme başı',
  haric: 'Finansal takibe dahil değil',
}

function formatTime(value: string): string {
  return value.slice(0, 5)
}

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function ServiceStructureDrawer({
  open,
  onOpenChange,
  student,
  services,
  groups,
  mainContactId,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  student: DrawerStudent
  services: ServiceRow[]
  groups: { id: string; name: string }[]
  mainContactId: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

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

  function handleUpdate(input: ServiceUpdateInput) {
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

  const activeCount = services.filter((s) => s.status === 'active').length

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* max-w-2xl BURADA, bileşenin varsayılanında değil: `Drawer`ın
          max-w-md'si onay kuyruğu gibi tek sütunlu listeler için doğru.
          Bu panel iki sütunlu bir detay ızgarası taşıyor. */}
      <DrawerContent className="max-w-2xl">
        <DrawerHeader>
          <DrawerTitle>Hizmet Yapısını Düzenle</DrawerTitle>
          <DrawerDescription>
            {student.name}
            {student.meta && ` · ${student.meta}`} — öğrenciye verilen aktif hizmetleri
            düzenleyin.
          </DrawerDescription>
        </DrawerHeader>

        <DrawerBody className="space-y-4">
          {/* ANA TEMAS ÖĞRETMENE SEÇTİRİLMEZ (§5). Kural burada yazıyor
              ki "neden koçluk seçildi?" sorusu panelde cevaplansın. */}
          <AlertBanner
            tone="info"
            title="Haftalık Akış ana teması otomatik belirlenir"
            description="Öncelik sırası: Koçluk > Birebir Ders > Grup Dersi."
          />

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-medium">Aktif Hizmetler</h3>
              <span className="text-xs text-muted-foreground">
                {activeCount} aktif hizmet
              </span>
            </div>

            {services.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Henüz hizmet tanımlanmadı"
                description="Öğrencinin haftalık ders ve koçluk düzenini tanımlayın. Haftalık Akış bu düzenden beslenir."
              />
            ) : (
              <ul className="space-y-3">
                {services.map((service) => (
                  <li key={service.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {formatServiceAxes(service)}
                          {service.groupName && (
                            <span className="text-muted-foreground">
                              {' '}
                              · {service.groupName}
                            </span>
                          )}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant={service.status === 'active' ? 'success' : 'neutral'}>
                            {service.status === 'active' ? 'Aktif' : 'Pasif'}
                          </Badge>
                          {service.id === mainContactId && (
                            <Badge variant="info">Ana temas</Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() =>
                            setEditingId((id) => (id === service.id ? null : service.id))
                          }
                        >
                          {editingId === service.id ? 'Kapat' : 'Düzenle'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isPending}
                          onClick={() =>
                            run(
                              () =>
                                setServiceStatusAction(
                                  student.id,
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
                      </div>
                    </div>

                    {/* İKİ SÜTUNLU ANAHTAR/DEĞER IZGARASI: hizmetin
                        tanımı (ne) solda, düzeni (ne zaman) sağda.
                        Tek satıra dizildiğinde "Online Grup Ders ·
                        Çarşamba 20:00 · 120 dk · Aylık paket" okunmuyordu. */}
                    <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                      <Row label="Hizmet" value={service.kind === 'ders' ? 'Ders' : 'Koçluk'} />
                      <Row label="Gün" value={WEEKDAY_LABEL[service.weekday]} />
                      <Row
                        label="Katılım"
                        value={service.participation === 'grup' ? 'Grup' : 'Birebir'}
                      />
                      <Row label="Saat" value={formatTime(service.startTime)} />
                      <Row label="Ortam" value={MEDIUM_LABEL[service.medium]} />
                      <Row
                        label="Planlanan Süre"
                        value={`${service.plannedDurationMinutes} dk`}
                      />
                      {service.groupName ? (
                        <Row label="Grup" value={service.groupName} />
                      ) : (
                        <span className="hidden sm:block" />
                      )}
                      <Row label="Başlangıç" value={formatDate(service.startDate)} />
                      <Row
                        label="Finans İlişkisi"
                        value={FINANCE_LABEL[service.financeLink]}
                        className="sm:col-span-2"
                      />
                    </dl>

                    {editingId === service.id && (
                      <ServiceEditForm
                        studentId={student.id}
                        service={service}
                        disabled={isPending}
                        onSubmit={handleUpdate}
                        onCancel={() => setEditingId(null)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-medium">Yeni Hizmet Ekle</h3>
              {!showForm && (
                <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
                  <Plus className="size-4" />
                  Hizmet Ekle
                </Button>
              )}
            </div>

            {showForm && (
              <ServiceForm
                studentId={student.id}
                groups={groups}
                disabled={isPending}
                onDone={() => setShowForm(false)}
                run={run}
              />
            )}
          </section>
        </DrawerBody>

        <DrawerFooter>
          {/* KAYDETME DÜĞMESİ YOK — VE BU BİLİNÇLİ.

              Referans görselde "Değişiklikleri Kaydet" var; orada panel
              bir taslak tutup sonunda topluca yazıyor. Buradaki her
              işlem (ekle, düzenle, pasife al) kendi başına bir sunucu
              eylemi ve anında yazılıyor: ileri tarihli düzen değişikliği
              oturum SİLİYOR (084), pasife alma gelecek üretimi
              durduruyor. Bunları bir "kaydet"in arkasına biriktirmek,
              hangi işlemin gerçekleştiğini belirsizleştirir ve yarıda
              kapatılan panelde sessiz veri kaybı yaratırdı.

              Bu yüzden alt şerit ne söz veriyor ne de bekletiyor. */}
          <p className="text-xs text-muted-foreground">
            Her değişiklik yapıldığı anda kaydedilir. Geçmiş kayıtlar etkilenmez.
          </p>
          <DrawerClose render={<Button variant="outline" />}>Kapat</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function Row({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="inline text-muted-foreground">{label}: </dt>
      <dd className="inline text-foreground">{value}</dd>
    </div>
  )
}

/**
 * Yeni hizmet formu.
 *
 * ÜÇ EKSEN AYRI SEÇİLİR (§5.3): Hizmet / Katılım / Ortam. Tek birleşik
 * liste ("Online Grup Ders", "Yüz Yüze Birebir Koçluk"...) sekiz seçenek
 * üretir ve yeni bir eksen eklendiğinde on altıya çıkardı.
 *
 * EKSENLER SEGMENTLİ, GÜN/SAAT DEĞİL: iki–üç seçenekli tercihler tek
 * tıkla görünür olmalı. Yedi seçenekli gün listesi segmente sığmaz ve
 * dar ekranda taşardı; o `NativeSelect` olarak kalıyor.
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
    <div className="space-y-4 rounded-lg border border-border bg-muted/40 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <SegmentedField
          label="Hizmet"
          value={kind}
          onChange={setKind}
          disabled={disabled}
          options={[
            { value: 'ders', label: 'Ders' },
            { value: 'kocluk', label: 'Koçluk' },
          ]}
        />
        <SegmentedField
          label="Katılım"
          value={participation}
          onChange={setParticipation}
          disabled={disabled}
          options={[
            { value: 'birebir', label: 'Birebir' },
            { value: 'grup', label: 'Grup' },
          ]}
        />
        <SegmentedField
          label="Ortam"
          value={medium}
          onChange={setMedium}
          disabled={disabled}
          options={[
            { value: 'online', label: 'Online' },
            { value: 'yuz_yuze', label: 'Yüz yüze' },
          ]}
        />
      </div>

      {participation === 'grup' && (
        <div className="space-y-1.5">
          <Label htmlFor="serviceGroup">Grup</Label>
          <NativeSelect
            id="serviceGroup"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
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
              edemiyordu. İhtiyaç tam burada doğuyor. */}
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
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="serviceWeekday">Gün</Label>
          <NativeSelect
            id="serviceWeekday"
            value={weekday}
            onChange={(e) => setWeekday(e.target.value)}
          >
            {([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((d) => (
              <option key={d} value={d}>
                {WEEKDAY_LABEL[d]}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="serviceTime">Saat</Label>
          <Input
            id="serviceTime"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="serviceDuration">Süre (dk)</Label>
          <Input
            id="serviceDuration"
            type="number"
            min={5}
            max={600}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="serviceStart">Başlangıç tarihi</Label>
          <Input
            id="serviceStart"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
      </div>

      <SegmentedField
        label="Finans İlişkisi"
        value={financeLink}
        onChange={setFinanceLink}
        disabled={disabled}
        options={FINANCE_OPTIONS}
      />

      <div className="flex items-center gap-2">
        <Button
          size="sm"
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
        <Button size="sm" variant="ghost" onClick={onDone}>
          Vazgeç
        </Button>
      </div>
    </div>
  )
}

/**
 * Hizmet düzenini düzenleme formu — İLERİ TARİHLİ DEĞİŞİKLİK (§5 no.7).
 *
 * TÜR / KATILIM / GRUP ALANLARI YOK. Bu üç eksen hizmetin kimliğidir:
 * "birebir ders"in "grup koçluğu"na dönüşmesi düzenleme değil, başka
 * bir hizmettir — eskisi pasife alınır, yenisi eklenir. Formda
 * gösterilip RPC tarafından reddedilmeleri, kullanıcıyı çıkmaz bir yola
 * sokardı.
 *
 * "Şu tarihten itibaren" ALANI ZORUNLU VE AYRI: kaydedilen şey yalnız
 * yeni saat değil, değişikliğin NE ZAMAN başladığı.
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
    <div className="mt-3 space-y-3 rounded-md border border-border bg-muted/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Gün</Label>
          <NativeSelect value={weekday} onChange={(e) => setWeekday(e.target.value)}>
            {([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((d) => (
              <option key={d} value={d}>
                {WEEKDAY_LABEL[d]}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label>Saat</Label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Süre (dk)</Label>
          <Input
            type="number"
            min={5}
            max={600}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>
            {service.status === 'active' ? 'Şu tarihten itibaren' : 'Başlangıç tarihi'}
          </Label>
          <Input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SegmentedField
          label="Ortam"
          value={medium}
          onChange={setMedium}
          disabled={disabled}
          options={[
            { value: 'online', label: 'Online' },
            { value: 'yuz_yuze', label: 'Yüz yüze' },
          ]}
        />
        <SegmentedField
          label="Finans İlişkisi"
          value={financeLink}
          onChange={setFinanceLink}
          disabled={disabled}
          options={FINANCE_OPTIONS}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {service.status === 'active'
          ? 'Geçmiş kayıtlar değişmez. Bu tarihten sonraki, henüz sonuçlanmamış oturumlar yeni düzene göre yeniden üretilir.'
          : 'Hizmet pasif. Düzeni tamamladıktan sonra "Aktifleştir" derseniz oturumlar bu tarihten itibaren üretilir.'}
      </p>

      <div className="flex items-center gap-2">
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
