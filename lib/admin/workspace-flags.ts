// MÜŞTERİ DURUM ETİKETLERİ — kurala dayalı, açıkça yazılı (126).
//
// Uydurma bir "sağlık puanı" yok: her etiket tek bir ölçülebilir kuralı
// cümleyle söyler ve yöneticinin ne yapacağını ima eder. Kural yoksa
// etiket yok — "her şey yolunda" etiketi gürültüdür.
//
// Askıya alınmış/arşivlenmiş alanlarda etiket üretilmez: orada durum
// rozeti zaten asıl bilgidir.

export interface WorkspaceFlagInput {
  status: string
  plan: string
  created_at: string
  trial_ends_at: string | null
  license_ends_at: string | null
  active_students: number
  student_limit: number | null
  teacher_last_login_at: string | null
  homework_7d: number
}

export interface WorkspaceFlag {
  tone: 'destructive' | 'warning'
  text: string
}

const DAY = 86_400_000

export function workspaceFlags(w: WorkspaceFlagInput, now: number = Date.now()): WorkspaceFlag[] {
  if (w.status !== 'active') return []
  const flags: WorkspaceFlag[] = []

  const endsAt = w.plan === 'trial' ? w.trial_ends_at : w.license_ends_at
  if (endsAt) {
    const left = Math.ceil((new Date(endsAt).getTime() - now) / DAY)
    if (left > 0 && left <= 7) {
      flags.push({
        tone: left <= 3 ? 'destructive' : 'warning',
        text: `${w.plan === 'trial' ? 'Deneme' : 'Plan'} ${left} gün içinde bitiyor`,
      })
    }
  }

  // Yeni açılmış alanı "7 gündür giriş yok" diye işaretlemek yanlış olur:
  // yalnız en az 7 günlük alanlarda.
  const oldEnough = now - new Date(w.created_at).getTime() >= 7 * DAY
  const lastLogin = w.teacher_last_login_at ? new Date(w.teacher_last_login_at).getTime() : null
  if (oldEnough && (lastLogin === null || now - lastLogin >= 7 * DAY)) {
    flags.push({ tone: 'warning', text: '7 gündür öğretmen girişi yok' })
  }

  if (w.active_students > 0 && w.homework_7d === 0) {
    flags.push({ tone: 'warning', text: 'Son 7 günde ödev verilmedi' })
  }

  if (w.student_limit != null && w.active_students >= w.student_limit) {
    flags.push({ tone: 'warning', text: 'Öğrenci limitine ulaştı' })
  }

  return flags
}
