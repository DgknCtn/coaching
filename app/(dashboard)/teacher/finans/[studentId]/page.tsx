import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Lock } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Section } from '@/components/shared/section'
import { getTeacherContext } from '@/lib/workspace'
import { todayDateString } from '@/lib/homework-status'
import { isValidMonth } from '@/lib/finance-ledger'
import { CONTACT_KIND_LABEL, contactKindOf, type ServiceLike } from '@/lib/service-structure'
import {
  ACCRUAL_SELECT,
  EXPENSE_SELECT,
  PAYMENT_SELECT,
  mapAccrual,
  mapExpense,
  mapPayment,
} from '../data'
import { StudentFinanceClient } from './student-finance-client'

export const metadata: Metadata = { title: 'Öğrenci finansı' }
export const dynamic = 'force-dynamic'

// ÖĞRENCİ FİNANS DETAYI (M1.0-02 §7).
//
// Ders başı örneği: "03 Ekim · Yüz yüze Matematik · 2 ders · 5.000 TL".
// Aylık sabit örneği: "Aylık sabit 12.500 · Ek birebir ders 1 × 1.750".
// Aylık program satırları finansı anlamak için gösterilir; detay yönetimi
// Ders & Görüşmeler'de kalır.

export default async function StudentFinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>
  searchParams: Promise<{ ay?: string }>
}) {
  const { studentId } = await params
  const { ay } = await searchParams
  const { supabase, workspaceId, role } = await getTeacherContext()

  if (role !== 'owner') {
    return (
      <div className="max-w-6xl p-6 md:p-8">
        <PageHeader title="Öğrenci finansı" />
        <Section variant="card">
          <EmptyState
            icon={Lock}
            title="Bu ekran çalışma alanı sahibine özel"
            description="Öğrenci ücretleri ve ödeme kayıtları yalnız çalışma alanının sahibi tarafından görülebilir."
          />
        </Section>
      </div>
    )
  }

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, status')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!student) notFound()

  const today = todayDateString()
  const month = isValidMonth(ay) ? ay : today.slice(0, 7)

  await supabase.rpc('ensure_period_accruals', { p_workspace_id: workspaceId })

  const [
    { data: accrualRows },
    { data: paymentRows },
    { data: expenseRows },
    { data: modelRows },
    { data: priceRows },
    { data: serviceRows },
    { data: noticeRows },
  ] = await Promise.all([
    supabase.from('finance_lessons').select(ACCRUAL_SELECT).eq('student_id', studentId).eq('workspace_id', workspaceId),
    supabase.from('finance_payments').select(PAYMENT_SELECT).eq('student_id', studentId).eq('workspace_id', workspaceId),
    supabase
      .from('finance_expenses')
      .select(EXPENSE_SELECT)
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .order('spent_on', { ascending: false }),
    supabase
      .from('student_finance_models')
      .select('id, model, collection_timing, valid_from, created_at')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId),
    supabase
      .from('student_price_versions')
      .select('id, price_type, amount_kurus, valid_from, created_at')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId),
    supabase
      .from('student_services')
      // finance_link + status M1.0-05 için: "aylik_paket" hizmeti aylık
      // sabit tahakkukun etiketi olarak kullanılıyor (aşağıda).
      .select('id, kind, participation, medium, finance_link, status')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId),
    supabase
      .from('parent_payment_notices')
      .select('id, month_start, status, note, created_at')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .order('month_start', { ascending: false })
      .limit(20),
  ])

  // Otomatik satırın hangi hizmetten geldiği: oturum → hizmet.
  const sessionIds = (accrualRows ?? [])
    .map((r) => r.service_session_id as string | null)
    .filter((x): x is string => !!x)
  const { data: sessionRows } = sessionIds.length
    ? await supabase.from('service_sessions').select('id, service_id').in('id', sessionIds)
    : { data: [] }
  const serviceLabel = new Map(
    (serviceRows ?? []).map((s) => [
      s.id as string,
      `${s.medium === 'yuz_yuze' ? 'Yüz yüze' : 'Online'} ${CONTACT_KIND_LABEL[contactKindOf(s as unknown as ServiceLike)]}`,
    ])
  )
  const sessionService = new Map((sessionRows ?? []).map((s) => [s.id as string, s.service_id as string]))

  // M1.0-05: aylık sabit tahakkuk YALNIZ para satırı olmasın — mümkünse
  // ilgili hizmete bağlansın. "aylik_paket" olarak işaretli, aktif ve TEK
  // olan hizmet varsa etiketi oradan gelir; birden fazla ya da sıfırsa
  // (hangi hizmete ait olduğu belirsiz) genel "Aylık sabit" etiketi kalır
  // — var olmayan bir kesinliği uydurmamak için.
  const aylikPaketServices = (serviceRows ?? []).filter(
    (s) => s.finance_link === 'aylik_paket' && s.status === 'active'
  )
  const aylikPaketServiceId =
    aylikPaketServices.length === 1 ? (aylikPaketServices[0].id as string) : null

  const accruals = (accrualRows ?? []).map((r) => {
    const base = mapAccrual(r as Record<string, unknown>)
    const sid = r.service_session_id as string | null
    const svc = sid ? sessionService.get(sid) : aylikPaketServiceId && base.kind === 'aylik' ? aylikPaketServiceId : undefined
    return { ...base, serviceLabel: svc ? (serviceLabel.get(svc) ?? null) : null }
  })

  return (
    <div className="max-w-6xl space-y-6 p-6 md:p-8">
      <PageHeader
        title={student.full_name as string}
        subtitle="Öğrenci finans detayı · cari hesap"
        badges={
          <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            <Lock className="size-3" aria-hidden />
            Yalnızca size özel
          </span>
        }
      />
      <StudentFinanceClient
        student={{ id: studentId, name: student.full_name as string }}
        month={month}
        today={today}
        accruals={accruals}
        payments={(paymentRows ?? []).map((r) => mapPayment(r as Record<string, unknown>))}
        expenses={(expenseRows ?? []).map((r) => mapExpense(r as Record<string, unknown>))}
        models={((modelRows ?? []) as Record<string, unknown>[]).map((m) => ({
          id: m.id as string,
          model: m.model as 'aylik_sabit' | 'ders_basi',
          collectionTiming: m.collection_timing as 'ay_basi' | 'ay_sonu' | 'ders_sonrasi',
          validFrom: m.valid_from as string,
          createdAt: m.created_at as string,
        }))}
        prices={((priceRows ?? []) as Record<string, unknown>[]).map((p) => ({
          id: p.id as string,
          priceType: p.price_type as 'aylik' | 'ek_ders' | 'ders_basi',
          amountKurus: Number(p.amount_kurus),
          validFrom: p.valid_from as string,
          createdAt: p.created_at as string,
        }))}
        notices={((noticeRows ?? []) as Record<string, unknown>[]).map((n) => ({
          id: n.id as string,
          monthStart: n.month_start as string,
          status: n.status as 'pending' | 'confirmed' | 'rejected',
          note: (n.note as string | null) ?? null,
        }))}
      />
    </div>
  )
}
