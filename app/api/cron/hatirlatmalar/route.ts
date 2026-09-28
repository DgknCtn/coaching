import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { checkCronAuth } from '@/lib/cron-auth'
import { reminderFor, type Reminder } from '@/lib/reminders'
import { reminderEmail } from '@/lib/email-templates'
import { emailConfigured, sendEmail, type SendStatus } from '@/lib/email'

export const dynamic = 'force-dynamic'

// DENEME VE LİSANS HATIRLATMALARI — günde bir (vercel.json, 09:00 TRT).
//
// Karar lib/reminders.ts'te (saf, testli), metin lib/email-templates.ts'te,
// gönderim ve çift gönderim koruması lib/email.ts + email_log'da (131).
//
// ?kuru=1 — HİÇBİR ŞEY GÖNDERMEZ, gidecek iletilerin listesini döner
// (alıcı adresi maskeli). Canlıya ilk kez açarken ve şüphede bu çağrılır.
//
// SINIR: çalışma başına en fazla GUNLUK_TAVAN ileti — Resend ücretsiz
// katmanı günde 100. Aşan kısım ertesi gün gider (tekillik anahtarı
// gönderilmemiş olanı tutmaz).
//
// Bildirimleri kapatan öğretmene (profiles.email_notifications) gitmez.
// Her çalışma cron_runs'a yazılır; Sistem sekmesi oradan gösterir.
// 180 günden eski email_log satırları burada silinir (131'in taahhüdü).

const GUNLUK_TAVAN = 90

function maskEmail(e: string): string {
  const [user, domain] = e.split('@')
  return `${user.slice(0, 2)}***@${domain ?? ''}`
}

export async function GET(request: NextRequest) {
  const auth = checkCronAuth(request)
  if (auth === 'not_configured') {
    console.error('[cron/hatirlatmalar] CRON_SECRET tanımlı değil; uç kapalı.')
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }
  if (auth === 'unauthorized') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const kuru = request.nextUrl.searchParams.get('kuru') === '1'
  const supabase = createServiceClient() as unknown as SupabaseClient
  const startedAt = new Date().toISOString()
  const now = new Date()

  const [wsRes, licRes] = await Promise.all([
    supabase
      .from('workspaces')
      .select('id, plan, status, is_library, trial_ends_at, owner_profile_id')
      .in('plan', ['trial', 'licensed'])
      .eq('status', 'active')
      .eq('is_library', false),
    supabase.from('workspace_licenses').select('workspace_id, ends_at').eq('status', 'active'),
  ])

  if (wsRes.error || licRes.error) {
    const code = (wsRes.error ?? licRes.error)!.code ?? 'error'
    await supabase.from('cron_runs').insert({
      job: 'hatirlatmalar', started_at: startedAt, finished_at: new Date().toISOString(), ok: false, affected: null, error: code,
    })
    return NextResponse.json({ error: 'query_failed' }, { status: 503 })
  }

  const licenseEnd = new Map(
    ((licRes.data ?? []) as { workspace_id: string; ends_at: string }[]).map((l) => [l.workspace_id, l.ends_at])
  )

  type Ws = { id: string; plan: string; status: string; is_library: boolean; trial_ends_at: string | null; owner_profile_id: string | null }
  const due: { ws: Ws; reminder: Reminder }[] = []
  for (const ws of (wsRes.data ?? []) as Ws[]) {
    const reminder = reminderFor(
      {
        workspaceId: ws.id,
        plan: ws.plan,
        status: ws.status,
        isLibrary: ws.is_library,
        trialEndsAt: ws.trial_ends_at,
        licenseEndsAt: licenseEnd.get(ws.id) ?? null,
      },
      now
    )
    if (reminder && ws.owner_profile_id) due.push({ ws, reminder })
  }

  const ownerIds = [...new Set(due.map((d) => d.ws.owner_profile_id!))]
  const { data: owners } = ownerIds.length
    ? await supabase.from('profiles').select('id, full_name, email, email_notifications').in('id', ownerIds)
    : { data: [] }
  const ownerById = new Map(
    ((owners ?? []) as { id: string; full_name: string | null; email: string | null; email_notifications: boolean }[]).map(
      (o) => [o.id, o]
    )
  )

  const plan = due
    .map(({ ws, reminder }) => ({ ws, reminder, owner: ownerById.get(ws.owner_profile_id!) }))
    .filter((p) => p.owner?.email && p.owner.email_notifications !== false)
    .slice(0, GUNLUK_TAVAN)

  if (kuru) {
    return NextResponse.json({
      kuru: true,
      configured: emailConfigured(),
      count: plan.length,
      items: plan.map((p) => ({
        workspace_id: p.ws.id,
        kind: p.reminder.kind,
        days_left: p.reminder.daysLeft,
        to: maskEmail(p.owner!.email!),
      })),
    })
  }

  const counts: Record<SendStatus, number> = { sent: 0, duplicate: 0, skipped: 0, failed: 0 }
  for (const p of plan) {
    const status = await sendEmail({
      kind: p.reminder.kind,
      dedupeKey: p.reminder.dedupeKey,
      to: p.owner!.email!,
      profileId: p.owner!.id,
      workspaceId: p.ws.id,
      content: reminderEmail({ kind: p.reminder.kind, teacherName: p.owner!.full_name, endsAt: p.reminder.endsAt }),
    })
    counts[status]++
  }

  // 131'in saklama taahhüdü: 180 günden eski kayıtlar.
  const { error: purgeError } = await supabase
    .from('email_log')
    .delete()
    .lt('created_at', new Date(now.getTime() - 180 * 86_400_000).toISOString())
  if (purgeError) console.error('[cron/hatirlatmalar] email_log temizliği başarısız:', purgeError.code)

  const ok = counts.failed === 0
  const { error: logError } = await supabase.from('cron_runs').insert({
    job: 'hatirlatmalar',
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    ok,
    affected: counts.sent,
    error: ok ? (emailConfigured() ? null : 'email_not_configured') : `failed:${counts.failed}`,
  })
  if (logError) console.error('[cron/hatirlatmalar] cron_runs yazılamadı:', logError.message)

  console.log(`[cron/hatirlatmalar] ${JSON.stringify(counts)}`)
  return NextResponse.json({ ok, ...counts, time: new Date().toISOString() })
}
