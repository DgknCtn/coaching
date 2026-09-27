import {
  computeStudentStatus,
  expectedProgressPercent,
  STATUS_THRESHOLDS,
  type StatusResult,
} from '@/lib/student-status'

// ============================================================
// OPERASYON SATIRINDAN ÖĞRENCİ DURUMU — TEK YER
//
// `teacher_student_operation_view` (080/097/103) yalnız GİRDİLERİ
// döndürüyor; durum (Yolunda / Takip Et / Geride / Müdahale Gerekli)
// uygulamada `computeStudentStatus` ile hesaplanıyor — eşikler SQL'e
// gömülmedi ki ayarlanabilir kalsınlar.
//
// NEDEN AYRI DOSYA: bu dönüşüm yalnız panelin (teacher/page.tsx)
// içindeydi. Öğrenciler listesi ise durumu başka bir view'ın eski SQL
// kuralından (`teacher_student_overview_view.risk_status`, 016/017:
// red/yellow/green) okuyor ve "İyi / Dikkat / Kritik" yazıyordu. Aynı
// öğrenci panelde "Takip Et", listede "İyi" görünebiliyordu. İki ekran
// artık aynı satırdan aynı fonksiyonla hesaplıyor.
// ============================================================

/** Durum hesabının okuduğu operasyon view sütunları. */
export interface OperationStatusRow {
  flow_started_at: string | null
  weekly_submitted_percent: number | null
  next_contact_at: string | null
  overdue_work_count: number | null
  status_update_due_at: string | null
  submission_cutoff_at: string | null
  days_since_real_work: number | null
  last_planning_at: string | null
  last_academic_note_at: string | null
}

export function statusFromOperationRow(s: OperationStatusRow, now: Date): StatusResult {
  const cutoff = s.submission_cutoff_at ? new Date(s.submission_cutoff_at) : null
  return computeStudentStatus({
    submittedPercent: Number(s.weekly_submitted_percent ?? 0),
    expectedPercent: expectedProgressPercent({
      startedAt: s.flow_started_at ? new Date(s.flow_started_at) : null,
      submissionCutoffAt: cutoff,
      now,
    }),
    msToNextContact: s.next_contact_at
      ? new Date(s.next_contact_at).getTime() - now.getTime()
      : null,
    overdueWorkCount: Number(s.overdue_work_count ?? 0),
    checkInOverdueHours: s.status_update_due_at
      ? Math.max(0, (now.getTime() - new Date(s.status_update_due_at).getTime()) / 3_600_000)
      : 0,
    submissionCutoffPassed: cutoff !== null && cutoff.getTime() < now.getTime(),
    // R8 §16 — ANA SİNYAL SON GERÇEK ÇALIŞMA HAREKETİ.
    //
    // `hasRecentSignalOfLife` planlamayı ve akademik notu BİRLİKTE
    // topluyor: ikisi de "öğrenci karanlıkta değil" demek. Ama hiçbiri
    // teslimin yerine geçmiyor — plan yapmış olmak çalışmamayı gizlemez.
    daysSinceRealWork: s.days_since_real_work ?? null,
    // "Karanlıkta değil" için hareketin YAKIN olması gerekir: altı ay önce
    // yazılmış bir not bugünü açıklamaz (106).
    hasRecentSignalOfLife: [s.last_planning_at, s.last_academic_note_at].some(
      (at) =>
        at !== null &&
        now.getTime() - new Date(at).getTime() < STATUS_THRESHOLDS.signalOfLifeDays * 86_400_000
    ),
  })
}
