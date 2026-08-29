import { describe, expect, it } from 'vitest'
import {
  BOOK_PLAN_STATUS_OPTIONS,
  BOOK_ROLE_OPTIONS,
  bookPlanGroup,
  bookPlanStatusLabel,
  bookRoleLabel,
  targetTypeLabel,
} from '@/lib/resource-plan'

// R5.1 sözlüğü — §3.1 ve §3.2.

describe('bookPlanStatusLabel', () => {
  it('üç ana durumu şartnamedeki adlarıyla verir', () => {
    expect(bookPlanStatusLabel('pending')).toBe('Bekliyor')
    expect(bookPlanStatusLabel('active')).toBe('Aktif')
    expect(bookPlanStatusLabel('completed')).toBe('Hedef Tamamlandı')
  })

  it('geriye dönük değerleri kırılmadan okur', () => {
    expect(bookPlanStatusLabel('paused')).toBe('Bekliyor')
    expect(bookPlanStatusLabel('archived')).toBe('Arşivlendi')
    expect(bookPlanStatusLabel(null)).toBe('Aktif')
    expect(bookPlanStatusLabel(undefined)).toBe('Aktif')
  })

  it('seçenek listesi yalnız üç ana durumu sunar', () => {
    expect(BOOK_PLAN_STATUS_OPTIONS.map(o => o.value)).toEqual([
      'pending',
      'active',
      'completed',
    ])
  })
})

describe('bookPlanGroup', () => {
  it('kaynakları üç kovaya ayırır', () => {
    expect(bookPlanGroup('active')).toBe('active')
    expect(bookPlanGroup('pending')).toBe('pending')
    expect(bookPlanGroup('completed')).toBe('completed')
  })

  it('paused Bekliyor kovasına düşer', () => {
    expect(bookPlanGroup('paused')).toBe('pending')
  })

  it('bilinmeyen değer aktif kabul edilir', () => {
    expect(bookPlanGroup(null)).toBe('active')
    expect(bookPlanGroup('archived')).toBe('active')
  })
})

describe('bookRoleLabel', () => {
  it('dört rolü şartnamedeki adlarıyla verir', () => {
    expect(bookRoleLabel('temel_olusturma')).toBe('Temel Oluşturma')
    expect(bookRoleLabel('ana_calisma')).toBe('Ana Çalışma')
    expect(bookRoleLabel('pekistirme')).toBe('Pekiştirme')
    expect(bookRoleLabel('yeniden_temas')).toBe('Yeniden Temas')
  })

  it('rol yoksa null döner (rozet hiç gösterilmez)', () => {
    expect(bookRoleLabel(null)).toBeNull()
    expect(bookRoleLabel(undefined)).toBeNull()
    expect(bookRoleLabel('')).toBeNull()
  })

  it('tanımsız rol null döner, çökmez', () => {
    expect(bookRoleLabel('bilinmeyen')).toBeNull()
  })

  it('seçenek listesi dört rolü sunar', () => {
    expect(BOOK_ROLE_OPTIONS).toHaveLength(4)
  })
})

describe('targetTypeLabel', () => {
  it('kapsam türünü ayırt eder', () => {
    expect(targetTypeLabel('whole_book')).toBe('Tam Kitap')
    expect(targetTypeLabel('sections')).toBe('Seçili Kapsam')
    expect(targetTypeLabel('units')).toBe('Seçili Kapsam')
  })

  it('hedef yoksa Tam Kitap kabul edilir', () => {
    expect(targetTypeLabel(null)).toBe('Tam Kitap')
    expect(targetTypeLabel(undefined)).toBe('Tam Kitap')
  })
})
