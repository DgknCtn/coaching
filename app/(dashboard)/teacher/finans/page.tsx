import type { Metadata } from 'next'
import Link from 'next/link'
import { Lock, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Section } from '@/components/shared/section'
import { getTeacherContext } from '@/lib/workspace'
import { financeTotals, topDebtors, type StudentFinanceRow } from '@/lib/finance'
import { formatKurus } from '@/lib/billing/pricing'
import { FinanceSummary } from './finance-summary'
import { FinanceMonthlyChart, type MonthlyPoint } from './finance-monthly-chart'
import { FinanceTable } from './finance-table'

export const metadata: Metadata = { title: 'Finans' }
export const dynamic = 'force-dynamic'

// FİNANS / ÖDEMELER (066).
//
// ============================================================
// SAHİBE ÖZEL
//
// Ücret ve borç, öğrencinin akademik verisinden farklı bir mahremiyet
// sınıfı: aynı çalışma alanında ders veren başka bir öğretmenin, bir
// ailenin ödeme yapıp yapmadığını bilmesi için hiçbir sebep yok.
//
// Buradaki kontrol yalnız DÜZGÜN BİR AÇIKLAMA göstermek için. Asıl
// savunma veritabanında: tablolar RLS ile 'owner' rolüne kilitli ve her
// RPC girişinde rolü yeniden kontrol ediyor. Bu satır silinse bile
// öğretmen boş bir tablo görürdü — ama nedenini anlamazdı.
//
// MENÜ ROLE GÖRE BUDANMIYOR: "Finans" bağlantısı her öğretmene görünür
// (Plan bağlantısında olduğu gibi). Menüyü role göre süzmek, yetkinin
// ikinci bir kaynağını yaratmak olurdu; sayfanın kendisi zaten doğru
// cevabı veriyor.
// ============================================================

export default async function FinancePage() {
  const { supabase, workspaceId, role } = await getTeacherContext()

  if (role !== 'owner') {
    return (
      <div className="max-w-6xl p-6 md:p-8">
        <PageHeader title="Finans" subtitle="Ders ücretleri, tahsilat ve bakiye" />
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

  const [{ data: financeRows }, { data: monthlyRows }] = await Promise.all([
    supabase
      .from('student_finance_view')
      .select(
        'student_id, student_full_name, student_status, per_lesson_kurus, lesson_count, accrued_kurus, collected_kurus, balance_kurus, last_lesson_on, last_payment_on'
      )
      .eq('workspace_id', workspaceId)
      .order('student_full_name')
      .limit(500),
    supabase.rpc('finance_monthly_summary', {
      p_workspace_id: workspaceId,
      p_months: 6,
    }),
  ])

  // ARŞİVLENMİŞ ÖĞRENCİ LİSTEDE KALIR ama sonda: ayrılan öğrencinin
  // ödenmemiş borcu silinmiş olmuyor. Gizlemek, tahsil edilecek parayı
  // ekrandan kaldırmak olurdu.
  const rows: StudentFinanceRow[] = (financeRows ?? []).map((r) => ({
    studentId: r.student_id as string,
    fullName: (r.student_full_name as string | null) ?? '—',
    status: (r.student_status as string | null) ?? 'active',
    perLessonKurus: (r.per_lesson_kurus as number | null) ?? null,
    lessonCount: Number(r.lesson_count ?? 0),
    accruedKurus: Number(r.accrued_kurus ?? 0),
    collectedKurus: Number(r.collected_kurus ?? 0),
    balanceKurus: Number(r.balance_kurus ?? 0),
    lastLessonOn: (r.last_lesson_on as string | null) ?? null,
    lastPaymentOn: (r.last_payment_on as string | null) ?? null,
  }))

  const totals = financeTotals(rows)
  const debtors = topDebtors(rows)

  const monthly: MonthlyPoint[] = ((monthlyRows ?? []) as Record<string, unknown>[]).map((m) => ({
    monthStart: m.month_start as string,
    accruedKurus: Number(m.accrued_kurus ?? 0),
    collectedKurus: Number(m.collected_kurus ?? 0),
  }))

  return (
    <div className="max-w-6xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Finans / Ödemeler"
        subtitle="Ders ücretleri, tahsilat ve öğrenci bazında bakiye"
        badges={
          <span
            className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
            title="Bu ekranı yalnız çalışma alanının sahibi görebilir."
          >
            <Lock className="size-3" aria-hidden />
            Yalnızca size özel
          </span>
        }
      />

      {rows.length === 0 ? (
        <Section variant="card">
          <EmptyState
            icon={Wallet}
            title="Henüz öğrenci yok"
            description="Öğrenci ekledikten sonra ders ücretlerini tanımlayıp ödeme takibine başlayabilirsiniz."
            action={{ label: 'Öğrenci ekle', href: '/teacher/students/new' }}
          />
        </Section>
      ) : (
        <>
          <FinanceSummary totals={totals} />

          <div className="grid gap-6 lg:grid-cols-2">
            <Section
              title="Aylık tahakkuk ve tahsilat"
              description="Son 6 ay"
              variant="card"
              contentClassName="p-4"
            >
              <FinanceMonthlyChart points={monthly} />
            </Section>

            <Section
              title="En çok borçlu öğrenciler"
              description={
                debtors.length > 0 ? `${totals.debtorCount} borçlu öğrenci` : undefined
              }
              variant="card"
              contentClassName="p-4"
            >
              {debtors.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="Borçlu öğrenci yok"
                  description="Tüm bakiyeler kapalı ya da fazla ödemede."
                  className="py-10"
                />
              ) : (
                <ul className="divide-y">
                  {debtors.map((d) => (
                    <li key={d.studentId} className="flex items-center justify-between gap-3 py-2.5">
                      <Link
                        href={`/teacher/students/${d.studentId}`}
                        className="min-w-0 truncate text-sm hover:underline"
                      >
                        {d.fullName}
                      </Link>
                      <span className="shrink-0 text-sm font-medium tabular-nums text-destructive-foreground">
                        {formatKurus(d.balanceKurus)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <FinanceTable rows={rows} />
        </>
      )}
    </div>
  )
}
