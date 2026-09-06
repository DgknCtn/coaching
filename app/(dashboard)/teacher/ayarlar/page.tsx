import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CreditCard, ShieldCheck } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { licenseState, LICENSE_STATE_LABEL, daysLeft } from '@/lib/plans'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { Button } from '@/components/ui/button'
import { AccountForm } from './account-form'
import { PasswordForm } from './password-form'

export const metadata: Metadata = { title: 'Ayarlar' }
export const dynamic = 'force-dynamic'

// AYARLAR (072).
//
// ============================================================
// NEDEN VAR
//
// `/teacher/ayarlar` kök adresi 404 veriyordu: altında yalnız `abonelik`
// ve `veri` sayfaları vardı ve ikisi sol menüde "Plan" ile "Hesap ve Veri"
// olarak AYRI AYRI duruyordu. Hesabıyla ilgili bir şey arayan kullanıcı
// için ortak bir yer yoktu — ad değiştirmek, şifre değiştirmek ve plana
// bakmak üç farklı zihinsel adresti; ilk ikisinin adresi ise hiç yoktu.
//
// BİLDİRİM AYARLARI BİLİNÇLİ OLARAK YOK: sistemde bildirim gönderen
// hiçbir altyapı yok. Hiçbir şeyi değiştirmeyen açma/kapama düğmeleri,
// kullanıcıya kapattığını sandığı bir şeyin aslında hiç var olmadığını
// gizler.
// ============================================================

export default async function SettingsPage() {
  const { profile, workspace, role, usage } = await getTeacherContext()

  const state = usage ? licenseState(usage) : null
  const endsAt =
    state === 'licensed' || state === 'license_expired'
      ? usage?.licenseEndsAt
      : usage?.trialEndsAt
  const left = daysLeft(endsAt ?? null)

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <PageHeader title="Ayarlar" subtitle="Hesap bilgileri, güvenlik ve plan" />

      <Section title="Hesap bilgileri" variant="card" contentClassName="p-5">
        <AccountForm
          fullName={profile.full_name}
          email={profile.email}
          workspaceName={workspace.name}
          isOwner={role === 'owner'}
        />
      </Section>

      <Section title="Şifre" variant="card" contentClassName="p-5">
        <PasswordForm />
      </Section>

      {/* PLAN BURADA ÖZETLENİR, YÖNETİLMEZ. Satın alma ve sipariş geçmişi
          kendi ekranında duruyor; buradaki tek iş "durumum ne?" sorusunu
          bir satırda yanıtlamak. */}
      <Section title="Plan" variant="card" contentClassName="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {state ? LICENSE_STATE_LABEL[state] : 'Plan bilgisi okunamadı'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {left != null
                ? left > 0
                  ? `${left} gün kaldı.`
                  : 'Süresi doldu.'
                : 'Süre sınırı yok.'}
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            render={<Link href="/teacher/ayarlar/abonelik" />}
          >
            <CreditCard className="size-3.5" />
            Planı yönet
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </Section>

      <Section title="Hesap ve veri" variant="card" contentClassName="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 text-sm text-muted-foreground">
            Verilerinizin dışa aktarılması ve hesabınızın silinmesi.
          </p>
          <Button variant="outline" size="sm" render={<Link href="/teacher/ayarlar/veri" />}>
            <ShieldCheck className="size-3.5" />
            Veri işlemleri
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </Section>
    </div>
  )
}
