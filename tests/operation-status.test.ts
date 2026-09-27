import { describe, it, expect } from 'vitest'
import { statusFromOperationRow, type OperationStatusRow } from '@/lib/operation-status'
import { STATUS_LABEL } from '@/lib/student-status'

// Panel ve Öğrenciler listesi durumu AYNI fonksiyonla hesaplıyor. Liste
// önceden eski SQL kuralını (risk_status: red/yellow/green) okuyordu.

const NOW = new Date('2026-09-27T12:00:00+03:00')

const empty: OperationStatusRow = {
  flow_started_at: null,
  weekly_submitted_percent: null,
  next_contact_at: null,
  overdue_work_count: null,
  status_update_due_at: null,
  submission_cutoff_at: null,
  days_since_real_work: null,
  last_planning_at: null,
  last_academic_note_at: null,
}

describe('statusFromOperationRow', () => {
  it('her zaman ürünün sözlüğünden bir durum döndürür', () => {
    const r = statusFromOperationRow(empty, NOW)
    expect(Object.keys(STATUS_LABEL)).toContain(r.status)
    expect(Array.isArray(r.signals)).toBe(true)
  })

  it('geciken iş ve uzun sessizlik "Yolunda" sayılmaz ve gerekçe verir', () => {
    const r = statusFromOperationRow(
      { ...empty, overdue_work_count: 6, days_since_real_work: 12 },
      NOW
    )
    expect(r.status).not.toBe('yolunda')
    expect(r.signals.length).toBeGreaterThan(0)
  })

  it('eski üçlü sözlük kullanılmıyor', () => {
    const labels = Object.values(STATUS_LABEL)
    for (const old of ['İyi', 'Dikkat', 'Kritik']) expect(labels).not.toContain(old)
  })
})
