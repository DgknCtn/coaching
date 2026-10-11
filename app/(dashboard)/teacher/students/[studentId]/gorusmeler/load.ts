// Ders & Görüşmeler — veritabanı satırından ekran satırına (M1.0-02).
//
// Öğrenci sayfası ve koç geneli haftalık ekran AYNI eşlemeyi kullanır;
// iki sayfada ayrı ayrı yazılsaydı bir kolon (ör. current_planned_at) bir
// yerde unutulur ve aynı oturum iki ekranda iki farklı saatte görünürdü.

import { CONTACT_KIND_LABEL, contactKindOf, type ServiceLike, type Weekday } from '@/lib/service-structure'
import type { MakeupStatus, SessionSource } from '@/lib/session-state'
import type { WeekServiceInfo } from '@/components/sessions/week-sessions'
import type { ServiceRow, SessionRow } from './types'

export const SERVICE_SELECT =
  'id, student_id, kind, participation, medium, group_id, cadence, weekday, start_time, weekday_2, start_time_2, planned_duration_minutes, start_date, submission_offset_minutes, finance_link, default_unit_count, is_main_contact, status'

export const SESSION_SELECT =
  'id, student_id, service_id, group_session_id, planned_at, current_planned_at, actual_at, duration_minutes, unit_count, status, attended, note, cancel_reason, makeup_of_session_id, makeup_decision, makeup_status, is_extra, source, origin_planned_at'

type Row = Record<string, unknown>

export function mapServiceRow(r: Row, groupNames: Map<string, string>): ServiceRow & { studentId: string } {
  return {
    id: r.id as string,
    studentId: r.student_id as string,
    kind: r.kind as ServiceRow['kind'],
    participation: r.participation as ServiceRow['participation'],
    medium: r.medium as ServiceRow['medium'],
    groupId: (r.group_id as string | null) ?? null,
    groupName: r.group_id ? (groupNames.get(r.group_id as string) ?? null) : null,
    cadence: ((r.cadence as string | null) ?? 'haftada_1') as ServiceRow['cadence'],
    weekday: r.weekday as Weekday,
    startTime: String(r.start_time).slice(0, 5),
    weekday2: (r.weekday_2 as Weekday | null) ?? null,
    startTime2: r.start_time_2 ? String(r.start_time_2).slice(0, 5) : null,
    plannedDurationMinutes: r.planned_duration_minutes as number,
    startDate: r.start_date as string,
    submissionOffsetMinutes: (r.submission_offset_minutes as number | null) ?? 0,
    financeLink: r.finance_link as ServiceRow['financeLink'],
    defaultUnitCount: Number(r.default_unit_count ?? 1),
    isMainContact: Boolean(r.is_main_contact),
    status: r.status as ServiceRow['status'],
  }
}

export function mapSessionRow(r: Row, studentName?: string): SessionRow {
  return {
    id: r.id as string,
    studentId: r.student_id as string,
    studentName,
    serviceId: r.service_id as string,
    plannedAt: r.planned_at as string,
    currentPlannedAt: ((r.current_planned_at as string | null) ?? r.planned_at) as string,
    actualAt: (r.actual_at as string | null) ?? null,
    durationMinutes: (r.duration_minutes as number | null) ?? null,
    unitCount: r.unit_count == null ? null : Number(r.unit_count),
    status: r.status as SessionRow['status'],
    attended: (r.attended as boolean | null) ?? null,
    note: (r.note as string | null) ?? null,
    cancelReason: (r.cancel_reason as string | null) ?? null,
    groupSessionId: (r.group_session_id as string | null) ?? null,
    isMakeup: r.makeup_of_session_id != null,
    isExtra: Boolean(r.is_extra),
    source: ((r.source as string | null) ?? 'takvim') as SessionSource,
    makeupDecision: (r.makeup_decision as 'pending' | 'waived' | null) ?? null,
    makeupStatus: ((r.makeup_status as string | null) ?? 'none') as MakeupStatus,
    originPlannedAt: (r.origin_planned_at as string | null) ?? null,
  }
}

/** Tablonun hizmet etiketi: "Koçluk", "Birebir Ders", "Grup Dersi · 12 AYT". */
export function serviceInfo(service: ServiceRow): WeekServiceInfo {
  const kind = CONTACT_KIND_LABEL[contactKindOf(service as ServiceLike)]
  return {
    id: service.id,
    label: service.groupName ? `${kind} · ${service.groupName}` : kind,
    participation: service.participation,
    financeLink: service.financeLink,
    defaultUnitCount: service.defaultUnitCount,
    plannedDurationMinutes: service.plannedDurationMinutes,
  }
}

/** Haftanın dokunduğu her ay için tembel oturum üretimi (idempotent RPC). */
export function monthsToGenerate(weekMonths: string[]): { year: number; month: number }[] {
  return weekMonths.map((m) => {
    const [year, month] = m.split('-').map(Number)
    return { year, month }
  })
}
