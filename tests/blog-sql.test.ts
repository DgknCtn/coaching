import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// 149 — BLOG: SQL GÜVENLİK KURALLARI
//
// NEDEN BU TEST VAR
//
// Blog, bu projede anon'a (oturumsuz ziyaretçiye) veri gösteren İLK
// özellik. Bugüne kadar hiçbir tablo anon'a SELECT vermedi ve
// tests/tenant-isolation.test.ts tam bunu koruyor. Yeni bir yüzey
// açılırken iki şeyin birden doğru olması gerekiyor:
//
//   1) TASLAK DIŞARI ÇIKMAMALI — public okuma fonksiyonları yayın
//      filtresini taşımak zorunda.
//   2) TABLONUN KENDİSİ KAPALI KALMALI — erişim yalnız fonksiyondan.
//      Tabloya ileride eklenecek bir sütun sessizce herkese açılmasın.
//
// Canlı veritabanı olmadan kurallar METİN olarak denetleniyor (repodaki
// diğer *-sql testleriyle aynı yöntem: academic-tasks-sql, m1-0-02-sql-security).
// Migration'ın kendi sonundaki DO bloğu aynı iddiaları ÇALIŞMA ANINDA
// da doğruluyor; bu test onun CI'da, veritabanına bağlanmadan çalışan
// karşılığı.
//
// AYRICA HATA MESAJLARI: dbErrorToTr (lib/auth-errors.ts) bir RPC
// mesajını kullanıcıya ancak Türkçe'ye özgü bir karakter içeriyorsa
// aynen geçiriyor; içermeyen her mesaj "İşlem tamamlanamadı"ya iniyor.
// Yani Türkçe yazılmış ama 'ı/ş/ğ/ü/ö/ç' içermeyen bir iş kuralı
// mesajı sessizce kaybolur. Son blok bunu yakalıyor.
// ============================================================

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/149_blog.sql'), 'utf8')

/** Yorum satırları atılır: karar kayıtları kuralları bilerek anıyor. */
const code = sql
  .split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function body(name: string): string {
  const match = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\(([\\s\\S]*?)\\$fn\\$([\\s\\S]*?)\\$fn\\$`
  ).exec(code)
  expect(match, `${name} fonksiyonu bulunamadı`).not.toBeNull()
  return match![2]
}

const PUBLIC_RPCS = ['blog_list_published', 'blog_get_published', 'blog_published_slugs']

const ADMIN_RPCS = [
  'admin_list_blog_posts',
  'admin_get_blog_post',
  'admin_save_blog_post',
  'admin_set_blog_post_status',
  'admin_delete_blog_post',
]

describe('149 blog · tablo kapalı', () => {
  it('doğrudan erişim anon ve authenticated için kaldırılmış', () => {
    expect(code).toMatch(
      /REVOKE ALL ON public\.blog_posts FROM PUBLIC, anon, authenticated/
    )
  })

  it('RLS açık', () => {
    expect(code).toMatch(/ALTER TABLE public\.blog_posts ENABLE ROW LEVEL SECURITY/)
  })

  it('tabloya SELECT politikası YAZILMAMIŞ — erişim yalnız fonksiyondan', () => {
    // Politika eklenmesi, fonksiyonların sütun sayma güvencesini boşa
    // çıkarırdı: tabloya eklenen yeni bir sütun politikayla birlikte
    // otomatik olarak okunabilir hâle gelir.
    expect(code).not.toMatch(/CREATE POLICY/)
  })

  it('tabloya anon ya da authenticated GRANT verilmemiş', () => {
    expect(code).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*ON\s+public\.blog_posts/i)
  })

  it('workspace_id sütunu YOK — blog kiracı verisi değil', () => {
    const create = /CREATE TABLE IF NOT EXISTS public\.blog_posts \(([\s\S]*?)\n\);/.exec(code)
    expect(create).not.toBeNull()
    expect(create![1]).not.toMatch(/workspace_id/)
  })
})

describe('149 blog · public okuma taslağı sızdırmıyor', () => {
  it.each(PUBLIC_RPCS)('%s yalnız yayınlanmışı döndürür', (name) => {
    const fn = body(name)
    expect(fn, `${name}: status filtresi yok`).toMatch(/status\s*=\s*'published'/)
    expect(fn, `${name}: published_at filtresi yok`).toMatch(/published_at\s*<=\s*NOW\(\)/)
  })

  it.each(PUBLIC_RPCS)('%s yetki listesinde adı geçiyor', (name) => {
    // Yetkiler `format('... public.%s ...', v_fn)` ile veriliyor; bu
    // yüzden fonksiyonun imzası DO bloğundaki diziye yazılmış olmalı.
    // Listede olmayan fonksiyon anon'a açılmaz ve blog sessizce boş
    // görünürdü.
    expect(code).toMatch(new RegExp(`'${name}\\([a-z,]*\\)'`))
  })

  it('public okuma GRANT bloğu anon içeriyor', () => {
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.%s TO anon, authenticated/)
  })

  it('blog_get_published içerik döndürür ama taslağı değil', () => {
    const fn = body('blog_get_published')
    expect(fn).toMatch(/b\.content/)
    expect(fn).toMatch(/status\s*=\s*'published'/)
  })

  it('public okuma fonksiyonları STABLE SECURITY DEFINER', () => {
    for (const name of PUBLIC_RPCS) {
      const header = new RegExp(
        `FUNCTION public\\.${name}\\([\\s\\S]*?LANGUAGE plpgsql STABLE SECURITY DEFINER`
      )
      expect(code, name).toMatch(header)
    }
  })

  it('public okuma fonksiyonlarında is_platform_admin YOK (herkese açık okuma)', () => {
    for (const name of PUBLIC_RPCS) {
      expect(body(name), name).not.toMatch(/is_platform_admin/)
    }
  })
})

describe('149 blog · yönetim işlemleri', () => {
  it.each(ADMIN_RPCS)('%s gövdesinde yönetici denetimi var', (name) => {
    expect(body(name)).toMatch(/IF NOT public\.is_platform_admin\(\) THEN/)
  })

  it.each(ADMIN_RPCS)('%s anon için EXECUTE kaldırılmış', (name) => {
    // Hepsi tek DO bloğundaki listede; listede olmayan bir fonksiyon
    // yetkisiz kalır ve migration'ın kendi doğrulaması patlar.
    expect(code).toMatch(new RegExp(`'${name}\\(`))
  })

  it('yönetim GRANT bloğu anon erişimini kaldırıyor', () => {
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.%s FROM PUBLIC, anon/)
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.%s TO authenticated/)
  })

  it('yayınla/geri çek ve sil yönetim kaydına yazar', () => {
    expect(body('admin_set_blog_post_status')).toMatch(/record_admin_action/)
    expect(body('admin_delete_blog_post')).toMatch(/record_admin_action/)
  })

  it('taslak kaydetme yönetim kaydına YAZMAZ (gerekçe istemiyor)', () => {
    // Her kaydetmede 10 karakter gerekçe istemek, yazarken on kez
    // gerekçe yazmak demekti; kayıt değersizleşirdi.
    const fn = body('admin_save_blog_post')
    expect(fn).not.toMatch(/record_admin_action/)
    expect(fn).not.toMatch(/require_admin_reason/)
  })

  it('silme kaydı silmeden ÖNCE yazılır — tek transaction', () => {
    const fn = body('admin_delete_blog_post')
    expect(fn.indexOf('record_admin_action')).toBeLessThan(fn.indexOf('DELETE FROM'))
  })

  it('yeni yazı her zaman taslak doğar', () => {
    const fn = body('admin_save_blog_post')
    expect(fn).toMatch(/'draft'/)
  })

  it('yeniden yayında ilk yayın tarihi korunur', () => {
    const fn = body('admin_set_blog_post_status')
    expect(fn).toMatch(/published_at IS NULL THEN NOW\(\)/)
    expect(fn).toMatch(/ELSE b\.published_at/)
  })

  it('durum güncellemesi satırı kilitler (eşzamanlı yayın yarışı)', () => {
    expect(body('admin_set_blog_post_status')).toMatch(/FOR UPDATE/)
    expect(body('admin_delete_blog_post')).toMatch(/FOR UPDATE/)
  })
})

describe('149 blog · kısıtlar', () => {
  it('slug biçimi ve uzunluğu veritabanında da zorlanıyor', () => {
    expect(code).toMatch(/slug ~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$'/)
    expect(code).toMatch(/length\(slug\) BETWEEN 3 AND 120/)
  })

  it('yayınlanmış yazının tarihi zorunlu', () => {
    expect(code).toMatch(/CHECK \(status <> 'published' OR published_at IS NOT NULL\)/)
  })

  it('kategori CHECK ile sınırlı', () => {
    expect(code).toMatch(/category IN \(/)
  })
})

// ============================================================
// HATA MESAJLARI TÜRKÇE KARAKTER TAŞIMAK ZORUNDA
// ============================================================

describe('149 blog · hata mesajları kullanıcıya ulaşıyor', () => {
  const TURKCE = /[çğıİöşüÇĞÖŞÜ]/

  it('iş kuralı mesajları dbErrorToTr tarafından yutulmuyor', () => {
    const mesajlar = [...code.matchAll(/RAISE EXCEPTION '([^']+)'/g)].map((m) => m[1])
    expect(mesajlar.length).toBeGreaterThan(0)

    const yutulanlar = mesajlar.filter((m) => {
      // 'Permission denied' BİLİNÇLİ İSTİSNA: dbErrorToTr onu ayrıca
      // tanıyıp "Bu işlem için yetkiniz yok." diye çeviriyor.
      if (m === 'Permission denied') return false
      // Doğrulama bloğunun mesajları kullanıcıya hiç gitmiyor —
      // migration çalıştıran geliştirici görüyor.
      if (m.startsWith('149 DOĞRULAMA')) return false
      return !TURKCE.test(m)
    })

    expect(
      yutulanlar,
      'Bu mesajlar Türkçe karakter taşımadığı için kullanıcıya ' +
        '"İşlem tamamlanamadı" olarak iner (lib/auth-errors.ts:dbErrorToTr). ' +
        'Mesaja Türkçe bir karakter ekleyin ya da metni değiştirin.'
    ).toEqual([])
  })
})
