import Link from 'next/link'
import { ArrowRight, KeyRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

// "PIN'İMİ UNUTTUM" İSTEKLERİ (143).
//
// Öğrenci ya da veli giriş ekranından istek bırakır; burada görünür.
// Öğretmen öğrencinin Veliler sekmesinde "Yeni PIN üret" deyince istek
// kendiliğinden kapanır ve kart kaybolur. İstek yoksa (ya da okuma
// düştüyse) kart hiç çizilmez: isteğe bağlı bir uyarı, başka bir şeyi
// yanıltmaz.

interface PinRequestRow {
  id: string
  role: 'student' | 'parent'
  full_name: string | null
  student_id: string | null
  student_name: string | null
  created_at: string
}

const relative = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' })

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 60) return relative.format(-Math.max(minutes, 1), 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return relative.format(-hours, 'hour')
  return relative.format(-Math.round(hours / 24), 'day')
}

export async function PinRequestsCard() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('pending_pin_reset_requests')
  if (error) return null
  const rows = (data ?? []) as PinRequestRow[]
  if (rows.length === 0) return null

  return (
    <section
      aria-labelledby="pin-requests-title"
      className="rounded-lg border border-warning-border bg-warning-subtle p-4"
    >
      <h2 id="pin-requests-title" className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="size-4" aria-hidden />
        PIN talepleri ({rows.length})
      </h2>
      <ul className="mt-3 divide-y rounded-md border bg-card">
        {rows.map((r) => {
          const who = r.full_name ?? 'Bir kullanıcı'
          const label =
            r.role === 'student' ? `${who} (öğrenci)` : `${who} (${r.student_name ?? 'öğrenci'} velisi)`
          const body = (
            <>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{label}</span>{' '}
                <span className="text-muted-foreground">yeni PIN istiyor · {ago(r.created_at)}</span>
              </span>
              {r.student_id && <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            </>
          )
          return (
            <li key={r.id}>
              {r.student_id ? (
                <Link
                  href={`/teacher/students/${r.student_id}?sekme=veliler`}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted"
                >
                  {body}
                </Link>
              ) : (
                <p className="flex items-center gap-3 px-3 py-2.5 text-sm">{body}</p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
