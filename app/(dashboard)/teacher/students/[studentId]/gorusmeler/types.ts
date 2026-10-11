// Ders & Görüşmeler ekranlarının paylaştığı satır tipleri (M1.0-02).
//
// Ayrı dosya, çünkü üç yer okuyor: öğrenci sayfası, koç geneli haftalık
// ekran ve Hizmet Yapısı paneli. Bileşen dosyasında dursalardı panel,
// tabloyu içe aktarmadan tipe ulaşamazdı.

import type { FinanceLink, ServiceCadence, SessionStatus, Weekday } from '@/lib/service-structure'
import type { MakeupStatus, SessionSource } from '@/lib/session-state'
import type { FinanceModelVersion, PriceVersion } from '@/lib/pricing-history'

export interface ServiceRow {
  id: string
  kind: 'ders' | 'kocluk'
  participation: 'birebir' | 'grup'
  medium: 'online' | 'yuz_yuze'
  groupId: string | null
  groupName: string | null
  cadence: ServiceCadence
  weekday: Weekday
  startTime: string
  weekday2: Weekday | null
  startTime2: string | null
  plannedDurationMinutes: number
  startDate: string
  submissionOffsetMinutes: number
  financeLink: FinanceLink
  defaultUnitCount: number
  isMainContact: boolean
  status: 'active' | 'passive' | 'archived'
}

export interface SessionRow {
  id: string
  studentId: string
  /** Koç geneli ekranda dolu; öğrenci sayfasında gereksiz. */
  studentName?: string
  serviceId: string
  plannedAt: string
  currentPlannedAt: string
  actualAt: string | null
  durationMinutes: number | null
  unitCount: number | null
  status: SessionStatus
  attended: boolean | null
  note: string | null
  cancelReason: string | null
  /** Grup oturumuysa ortak kaydın kimliği; birebirde null. */
  groupSessionId: string | null
  isMakeup: boolean
  isExtra: boolean
  source: SessionSource
  makeupDecision: 'pending' | 'waived' | null
  makeupStatus: MakeupStatus
  /** Telafiyse: asıl oturumun planlanan anı. */
  originPlannedAt: string | null
}

/** Hizmet Modeli kartının verisi; null = finansı görme yetkisi yok (owner değil). */
export interface FinanceModelInfo {
  models: (FinanceModelVersion & { id: string })[]
  prices: (PriceVersion & { id: string })[]
}
