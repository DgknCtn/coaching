import { describe, it, expect } from 'vitest'
import { dbErrorToTr } from '@/lib/auth-errors'

const GENERIC = 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'

describe('dbErrorToTr', () => {
  // RPC'lerimizin bilinçli Türkçe iş kuralı mesajları kullanıcının bugün
  // gördüğü uyarılar — aynen geçmeli, yoksa ekranlar bilgi kaybeder.
  it('RPC\'lerin Türkçe iş kuralı mesajlarını aynen geçirir', () => {
    const messages = [
      'Kitap bulunamadı',
      'Bölüm adı boş olamaz',
      'Bir bölüm en fazla 1000 sayfa olabilir',
      'Geçerli bir sayfa aralığı girin',
      'Hedef tarihi başlangıçtan önce olamaz',
      'Yeni baskı yılı mevcut baskıdan farklı olmalı',
      'Test sayısı 1 ile 200 arasında olmalı',
      'Bu kitap sayfa aralığı ile takip edilmiyor',
      'Öğrenci bulunamadı',
      'Bu bölümdeki testler ödevlerde veya tamamlama kayıtlarında kullanılmış, bölüm silinemez.',
    ]
    for (const message of messages) {
      expect(dbErrorToTr(message)).toBe(message)
    }
  })

  // Ham Postgres hataları kısıt/tablo/sütun adlarını sızdırıyordu.
  it('ham Postgres hatalarını genel mesaja indirir', () => {
    const leaky = [
      'duplicate key value violates unique constraint "uniq_active_student_book_target"',
      'insert or update on table "homework_items" violates foreign key constraint "homework_items_book_test_id_fkey"',
      'invalid input syntax for type uuid: "abc"',
      'null value in column "workspace_id" of relation "books" violates not-null constraint',
      'new row violates row-level security policy for table "book_tests"',
    ]
    for (const message of leaky) {
      expect(dbErrorToTr(message)).toBe(GENERIC)
    }
  })

  // Bir kaydın VARLIĞINI doğrulayan oracle: UUID sızdırmamalı.
  it('kayıt varlığını doğrulayan İngilizce mesajları maskeler', () => {
    const message = 'Invalid student_book_assignment_id: 3f0c1d2e-0000-4000-8000-000000000000'
    const result = dbErrorToTr(message)
    expect(result).toBe(GENERIC)
    expect(result).not.toContain('3f0c1d2e')
  })

  it('yetki hatasını anlaşılır Türkçeye çevirir', () => {
    expect(dbErrorToTr('Permission denied')).toBe('Bu işlem için yetkiniz yok.')
    expect(dbErrorToTr('permission denied for table books')).toBe('Bu işlem için yetkiniz yok.')
  })

  it('boş/eksik mesajda genel mesaja düşer', () => {
    expect(dbErrorToTr('')).toBe(GENERIC)
    expect(dbErrorToTr(null)).toBe(GENERIC)
    expect(dbErrorToTr(undefined)).toBe(GENERIC)
  })
})
