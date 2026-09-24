import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// KİMLİK FORMLARI GET İLE GÖNDERİLEMEZ (R8 · üretime hazırlık)
//
// ============================================================
// NEDEN BU TEST VAR
//
// Üretim derlemesinde, giriş ekranında şu adres görüldü:
//
//   /login?email=dogu%40test.com&password=test123123
//
// Şifre adres çubuğunda. Oradan tarayıcı geçmişine, sunucu erişim
// loglarına ve Referer başlığıyla üçüncü taraflara sızar.
//
// SEBEP: form gönderimi JavaScript ile yakalanıyor ama `method`
// belirtilmemişti. JS henüz hazır değilken (hydration tamamlanmadan)
// Enter'a basılırsa tarayıcı KENDİ varsayılanını uygular ve
// `method` yoksa varsayılan **GET**'tir — yani bütün alanlar sorgu
// dizesine yazılır.
//
// Bu bir "yalnızca yavaş bağlantıda olur" durumu değil: ilk yüklemede,
// sekme arka plandayken ya da JS bir uzantı yüzünden geciktiğinde de
// oluşur. Canlıda bir kez oldu; kanıt yukarıdaki adres.
//
// `method="post"` o aralığı kapatıyor: aynı kazada alanlar istek
// gövdesinde gider, adres çubuğunda görünmez. Asıl gönderim yine
// `handleSubmit` üzerinden yapılıyor.
//
// ============================================================
// NEDEN ŞİFRESİZ FORMLAR DA LİSTEDE
//
// `forgot-password` yalnız e-posta alıyor. O da kişisel veri ve
// sunucu loglarına düşmemeli; ayrıca kuralın istisnası olmaması,
// bir sonraki formu yazanın "burada şifre yok, gerek yok" diye
// düşünmesini engelliyor.
// ============================================================

/** Kimlik bilgisi taşıyan ve GET ile gönderilmemesi gereken formlar. */
const KIMLIK_FORMLARI = [
  { dosya: 'app/(auth)/login/page.tsx', tasidigi: 'e-posta + şifre' },
  { dosya: 'app/(auth)/register/page.tsx', tasidigi: 'e-posta + şifre' },
  { dosya: 'app/(auth)/update-password/page.tsx', tasidigi: 'yeni şifre' },
  { dosya: 'app/invite/[token]/invite-form.tsx', tasidigi: 'e-posta + şifre' },
  { dosya: 'app/(auth)/forgot-password/page.tsx', tasidigi: 'e-posta' },
] as const

describe('kimlik formları · GET ile gönderilemez', () => {
  it.each(KIMLIK_FORMLARI)('$dosya ($tasidigi) method="post" taşır', ({ dosya }) => {
    const kaynak = readFileSync(join(process.cwd(), dosya), 'utf8')

    // Dosyadaki her <form ...> açılışı denetlenir: biri eksikse yeter.
    const formlar = [...kaynak.matchAll(/<form\b[^>]*>/g)].map(m => m[0])

    expect(formlar.length, `${dosya} içinde <form> bulunamadı`).toBeGreaterThan(0)

    const methodsuz = formlar.filter(f => !/method\s*=\s*["']post["']/i.test(f))

    expect(
      methodsuz,
      `${dosya}: method="post" olmayan form var. JS hazır olmadan gönderilirse ` +
        'tarayıcı GET yapar ve alanlar (şifre dahil) adres çubuğuna yazılır.'
    ).toEqual([])
  })

  it('liste kısalmadı', () => {
    // Bir form listeden düşerse test sessizce daralır ve o dosya
    // korumasız kalır.
    expect(KIMLIK_FORMLARI.length).toBeGreaterThanOrEqual(5)
  })
})
