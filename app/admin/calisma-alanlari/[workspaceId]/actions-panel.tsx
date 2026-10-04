'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionDialog } from '@/components/admin/action-dialog'
import { formatDateTr } from '@/lib/format'
import { extendByDays, extendByMonths } from '@/lib/admin/action-preview'
import {
  extendTrialAction,
  grantLicenseAction,
  setStudentLimitAction,
  setWorkspaceStatusAction,
} from '@/app/admin/admin-actions'
import { CleanupButton } from '@/app/admin/cleanup-button'

// İŞLEM PANELİ (128) — müşteri detayında.
//
// Yalnız o alanda anlamlı işlemler görünür: denemede olmayana "deneme
// uzat", kurumsala "lisans ver" yok. Asıl kural veritabanında; burada
// gizlemek yalnız yanlış düğmeye basılmasını önler.

export interface ActionsPanelProps {
  workspaceId: string
  workspaceName: string
  plan: string
  status: string
  trialEndsAt: string | null
  studentLimit: number | null
  activeStudents: number
  licenseEndsAt: string | null
  licenseStudentCount: number | null
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  min: number
  max: number
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="max-w-32"
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Change({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <p>
      {label}: <span className="text-muted-foreground">{from}</span> → <span className="font-medium">{to}</span>
    </p>
  )
}

const toInt = (v: string) => (/^\d+$/.test(v) ? Number(v) : NaN)

export function ActionsPanel(p: ActionsPanelProps) {
  const [days, setDays] = useState('7')
  const [months, setMonths] = useState('1')
  const [students, setStudents] = useState(String(p.licenseStudentCount ?? p.studentLimit ?? 10))
  const [limit, setLimit] = useState(String(p.studentLimit ?? p.activeStudents))

  const isTrial = p.plan === 'trial'
  const isInstitution = p.plan === 'institution'
  const canToggle = p.status === 'active' || p.status === 'suspended'

  const nDays = toInt(days)
  const nMonths = toInt(months)
  const nStudents = toInt(students)
  const nLimit = toInt(limit)

  return (
    <div className="flex flex-wrap gap-2">
      {isTrial && (
        <ActionDialog
          triggerLabel="Denemeyi uzat"
          title="Denemeyi uzat"
          description="Deneme bitmişse uzatma bugünden sayılır."
          submitLabel="Uzat"
          successMessage="Deneme uzatıldı."
          preview={
            Number.isFinite(nDays) && nDays >= 1 && nDays <= 30 ? (
              <Change
                label="Deneme bitişi"
                from={formatDateTr(p.trialEndsAt)}
                to={formatDateTr(extendByDays(p.trialEndsAt, nDays))}
              />
            ) : (
              <p className="text-muted-foreground">1 ile 30 arasında bir gün sayısı girin.</p>
            )
          }
          onSubmit={(reason) => extendTrialAction({ workspaceId: p.workspaceId, days, reason })}
        >
          <NumberField id="extend-days" label="Gün" value={days} onChange={setDays} min={1} max={30} />
        </ActionDialog>
      )}

      {!isInstitution && (
        <ActionDialog
          triggerLabel="Lisans ver"
          title="Ödemesiz lisans ver"
          description="Süre mevcut lisansın üstüne eklenir; öğrenci hakkı büyük olan değer olur. Ödeme ve partner hakedişi oluşmaz."
          submitLabel="Lisans ver"
          successMessage="Lisans verildi."
          preview={
            Number.isFinite(nMonths) && Number.isFinite(nStudents) && nMonths >= 1 && nStudents >= 1 ? (
              <>
                <Change label="Plan" from={isTrial ? 'Deneme' : 'Lisanslı'} to="Lisanslı" />
                <Change
                  label="Lisans bitişi"
                  from={formatDateTr(p.licenseEndsAt)}
                  to={formatDateTr(extendByMonths(p.licenseEndsAt, nMonths))}
                />
                <Change
                  label="Öğrenci hakkı"
                  from={String(p.licenseStudentCount ?? p.studentLimit ?? '—')}
                  to={String(Math.max(nStudents, p.licenseStudentCount ?? 0))}
                />
              </>
            ) : (
              <p className="text-muted-foreground">Ay ve öğrenci sayısını girin.</p>
            )
          }
          onSubmit={(reason) =>
            grantLicenseAction({ workspaceId: p.workspaceId, studentCount: students, months, reason })
          }
        >
          <div className="flex flex-wrap gap-4">
            <NumberField id="grant-students" label="Öğrenci" value={students} onChange={setStudents} min={1} max={1000} />
            <NumberField id="grant-months" label="Ay" value={months} onChange={setMonths} min={1} max={24} />
          </div>
        </ActionDialog>
      )}

      {!isInstitution && (
        <ActionDialog
          triggerLabel="Öğrenci limiti"
          title="Öğrenci limitini değiştir"
          description={`Mevcut ${p.activeStudents} aktif öğrencinin altına düşürülemez.`}
          submitLabel="Değiştir"
          successMessage="Öğrenci limiti değişti."
          preview={
            Number.isFinite(nLimit) ? (
              <Change label="Öğrenci limiti" from={String(p.studentLimit ?? '—')} to={String(nLimit)} />
            ) : undefined
          }
          onSubmit={(reason) => setStudentLimitAction({ workspaceId: p.workspaceId, limit, reason })}
        >
          <NumberField
            id="student-limit"
            label="Yeni limit"
            value={limit}
            onChange={setLimit}
            min={Math.max(1, p.activeStudents)}
            max={10000}
          />
        </ActionDialog>
      )}

      {canToggle &&
        (p.status === 'active' ? (
          <ActionDialog
            triggerLabel="Askıya al"
            title="Çalışma alanını askıya al"
            description="Öğretmen, öğrenci ve veliler için tüm okuma ve yazma hemen kapanır. Veri silinmez; yeniden açılabilir."
            submitLabel="Askıya al"
            successMessage="Çalışma alanı askıya alındı."
            destructive
            confirmPhrase={p.workspaceName}
            preview={<Change label="Durum" from="Aktif" to="Askıda" />}
            onSubmit={(reason) =>
              setWorkspaceStatusAction({ workspaceId: p.workspaceId, status: 'suspended', reason })
            }
          />
        ) : (
          <ActionDialog
            triggerLabel="Yeniden aç"
            title="Çalışma alanını yeniden aç"
            description="Erişim hemen açılır. Deneme ya da plan süresi dolmuşsa erişim yine süre nedeniyle kapalı kalır."
            submitLabel="Yeniden aç"
            successMessage="Çalışma alanı yeniden açıldı."
            preview={<Change label="Durum" from="Askıda" to="Aktif" />}
            onSubmit={(reason) =>
              setWorkspaceStatusAction({ workspaceId: p.workspaceId, status: 'active', reason })
            }
          />
        ))}

      {/* 136: test alanını kalıcı sil. Ödenmiş siparişi/komisyonu olan ya da
          kütüphane alanı silinemez — önizleme engeli gösterir. */}
      <CleanupButton kind="workspace" id={p.workspaceId} redirectTo="/admin/musteriler" />
    </div>
  )
}
