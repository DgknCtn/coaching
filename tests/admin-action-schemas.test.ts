import { describe, it, expect } from 'vitest'
import {
  extendTrialSchema,
  grantLicenseSchema,
  resolveOrderSchema,
  setStatusSchema,
  studentLimitSchema,
  firstIssue,
} from '@/lib/admin/action-schemas'

const WS = '4e4052f6-171e-4a19-89db-eb29e4010e33'
const REASON = 'Müşteri telefonla istedi, onaylandı.'

describe('yönetim işlemi şemaları', () => {
  it('gerekçe zorunlu: kırpılmış 10-500 karakter', () => {
    const short = extendTrialSchema.safeParse({ workspaceId: WS, days: 3, reason: '   kısa    ' })
    expect(short.success).toBe(false)
    if (!short.success) expect(firstIssue(short.error)).toBe('Gerekçe en az 10 karakter olmalı.')
    expect(extendTrialSchema.safeParse({ workspaceId: WS, days: 3, reason: 'x'.repeat(501) }).success).toBe(false)
    const ok = extendTrialSchema.safeParse({ workspaceId: WS, days: '7', reason: `  ${REASON}  ` })
    expect(ok.success && ok.data).toEqual({ workspaceId: WS, days: 7, reason: REASON })
  })

  it('sınırlar veritabanıyla aynı', () => {
    expect(extendTrialSchema.safeParse({ workspaceId: WS, days: 31, reason: REASON }).success).toBe(false)
    expect(extendTrialSchema.safeParse({ workspaceId: WS, days: 0, reason: REASON }).success).toBe(false)
    expect(extendTrialSchema.safeParse({ workspaceId: WS, days: 1.5, reason: REASON }).success).toBe(false)
    expect(grantLicenseSchema.safeParse({ workspaceId: WS, studentCount: 1001, months: 1, reason: REASON }).success).toBe(false)
    expect(grantLicenseSchema.safeParse({ workspaceId: WS, studentCount: 10, months: 25, reason: REASON }).success).toBe(false)
    expect(studentLimitSchema.safeParse({ workspaceId: WS, limit: 0, reason: REASON }).success).toBe(false)
  })

  it('durum ve sonuç yalnız izinli değerler', () => {
    expect(setStatusSchema.safeParse({ workspaceId: WS, status: 'archived', reason: REASON }).success).toBe(false)
    expect(setStatusSchema.safeParse({ workspaceId: WS, status: 'suspended', reason: REASON }).success).toBe(true)
    expect(resolveOrderSchema.safeParse({ orderId: WS, outcome: 'cancelled', reason: REASON }).success).toBe(false)
  })

  it('kimlik uuid olmalı', () => {
    expect(extendTrialSchema.safeParse({ workspaceId: 'abc', days: 3, reason: REASON }).success).toBe(false)
  })
})
