import { describe, it, expect, vi, beforeAll } from 'vitest'

// `server-only` testte boş modül: yardımcılar saf ama dosya sunucuya özel.
vi.mock('server-only', () => ({}))

let mod: typeof import('@/lib/student-login')

beforeAll(async () => {
  process.env.STUDENT_LOGIN_SECRET = 'test-secret'
  process.env.STUDENT_LOGIN_EMAIL_DOMAIN = 'ogrenci.example.test'
  mod = await import('@/lib/student-login')
})

// E-POSTASIZ ÖĞRENCİ GİRİŞİ (10a · 119)

describe('kullanıcı adı', () => {
  it('Türkçe adı okunur ve kurala uygun bir ada çevirir', () => {
    for (const name of ['Ayşe Yılmaz', 'İsmail Çağrı Öztürk', 'Ş', '  ', 'Ali']) {
      const u = mod.generateUsername(name)
      expect(u, name).toMatch(mod.USERNAME_PATTERN)
    }
    expect(mod.generateUsername('Ayşe Yılmaz')).toMatch(/^ayse\.y\d{4}$/)
  })
})

describe('PIN', () => {
  it('her zaman 6 hane', () => {
    for (let i = 0; i < 200; i++) expect(mod.generatePin()).toMatch(/^\d{6}$/)
  })
})

describe('hesap şifresi', () => {
  it('PIN içermez, sırdan türer ve kararlıdır', () => {
    const a = mod.studentLoginPassword('ayse.y4821')
    expect(a).toBe(mod.studentLoginPassword('AYSE.Y4821'))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(mod.studentLoginPassword('ayse.y4822'))
  })

  it('sır değişirse şifre de değişir (sırrı döndürmek girişleri bozar — belgelendi)', () => {
    const before = mod.studentLoginPassword('ali1234')
    process.env.STUDENT_LOGIN_SECRET = 'baska-sir'
    expect(mod.studentLoginPassword('ali1234')).not.toBe(before)
    process.env.STUDENT_LOGIN_SECRET = 'test-secret'
  })

  it('sistem adresi yapılandırılmış alan adında', () => {
    expect(mod.studentLoginEmail('Ayse.Y4821')).toBe('ayse.y4821@ogrenci.example.test')
  })
})
