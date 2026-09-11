import { describe, expect, it } from 'vitest'

import {
  activeStudentTab,
  studentOverviewTabs,
  studentScreens,
  studentTabs,
} from '@/components/nav-config'

// ============================================================
// ÖĞRENCİ SEKME ŞERİDİ — R7 / SİTE TESTİ 03
//
// NEDEN BU TEST VAR
//
// Şerit on üç düz bağlantıdan dokuz başlıklı bir aile yapısına geçti.
// Bu dönüşümün iki sessiz kırılma biçimi var:
//
//   1. BİR EKRAN KAYBOLUR. Gruplama sırasında bir yol listeye
//      yazılmazsa ekran erişilemez hâle gelir ama hiçbir şey hata
//      vermez — tip kontrolü de derleme de sessiz kalır. Doküman §9'un
//      kabul maddesi tam olarak bunu yasaklıyor: "Mevcut işlevler
//      kaybolmadan yeni menüye taşınmış durumda."
//
//   2. AKTİF SEKME YANLIŞ İŞARETLENİR. Kural iki ayrı mantık taşıyor
//      (sorgu parametresi vs. en uzun yol eşleşmesi) ve "Genel Bakış"
//      her alt rotanın önekidir. Naif bir startsWith'te Genel Bakış hep
//      aktif çıkar; grup altındaki bir ekranda ise hiçbiri aktif
//      çıkmaz.
//
// Şerit bir client component içinde render edildiği için bu kuralların
// hiçbiri jsdom kurmadan ekranda doğrulanamaz; kural saf fonksiyona
// (activeStudentTab) çekildi ve burada kilitleniyor.
// ============================================================

const SID = '11111111-2222-3333-4444-555555555555'
const BASE = `/teacher/students/${SID}`
const TABS = studentTabs(SID)

/** Şeritteki ve gruplardaki bütün hedefler. */
function allHrefs(): string[] {
  const out: string[] = []
  for (const tab of TABS) {
    if (tab.href) out.push(tab.href)
    for (const item of tab.items ?? []) if (item.href) out.push(item.href)
  }
  return out
}

describe('hedef menü yapısı (doküman §2)', () => {
  it('üst seviye sıra dokümandaki hedef sırayla aynı', () => {
    // Doküman §2: "Genel Bakış | Haftalık Akış | Ödevler | Kaynaklar |
    // Akademik Akış | Görüşmeler | Koruma Havuzu | Rapor | Diğer"
    expect(TABS.map((t) => t.label)).toEqual([
      'Genel Bakış',
      'Haftalık Akış',
      'Ödevler',
      'Kaynaklar',
      'Akademik Akış',
      'Görüşmeler',
      'Koruma Havuzu',
      'Rapor',
      'Diğer',
    ])
  })

  it('Kaynaklar ve Ödevler zorunlu ara ekran açmaz', () => {
    // Doküman §4: "İki büyük karttan oluşan zorunlu bir ara açılış
    // ekranı yapılmamalıdır." Aile başlığının kendi hedefi olmalı ve o
    // hedef ilk alt görünümle aynı olmalı — başlığa tıklayan kullanıcı
    // seçim ekranına değil, işin yapıldığı yere gitmeli.
    for (const key of ['odevler', 'kaynaklar']) {
      const tab = TABS.find((t) => t.key === key)
      expect(tab, `${key} sekmesi yok`).toBeDefined()
      expect(tab!.href, `${key} başlığının hedefi yok`).toBeTruthy()
      expect(tab!.href).toBe(tab!.items?.[0]?.href)
    }
  })

  it('Diğer yalnız açılır menüdür, kendi hedefi yoktur', () => {
    // Altındaki ekranların hiçbiri "varsayılan" sayılamaz; başlığa
    // hedef verilseydi tıklama rastgele birine giderdi.
    const diger = TABS.find((t) => t.key === 'diger')
    expect(diger?.href).toBeUndefined()
    expect(diger?.items?.length).toBeGreaterThan(0)
  })

  it('her sekmenin ya hedefi ya alt görünümü var', () => {
    // İkisi de yoksa şerit tıklanamayan bir etiket basar.
    for (const tab of TABS) {
      expect(
        Boolean(tab.href) || (tab.items?.length ?? 0) > 0,
        `${tab.label} hiçbir yere gitmiyor`
      ).toBe(true)
    }
  })
})

describe('hiçbir ekran kaybolmadı (doküman §9 kabul)', () => {
  it('studentScreens içindeki her yol şeritte var', () => {
    const hrefs = allHrefs()
    for (const screen of studentScreens) {
      expect(
        hrefs,
        `${screen.label} (${screen.path}) şeritten düşmüş`
      ).toContain(`${BASE}/${screen.path}`)
    }
  })

  it('Genel Bakış panellerinin her biri şeritte var', () => {
    const hrefs = allHrefs()
    for (const tab of studentOverviewTabs) {
      expect(
        hrefs,
        `?sekme=${tab.slug} paneli şeritten düşmüş`
      ).toContain(`${BASE}?sekme=${tab.slug}`)
    }
  })

  it('Öğrenci Ayarları (edit) şeritte var', () => {
    // studentScreens'te değil — ayrı bir rota. Doküman §2 onu Diğer
    // altına koyuyor; listeye elle eklendiği için düşmesi kolay.
    expect(allHrefs()).toContain(`${BASE}/edit`)
  })

  it('aynı hedef iki kez listelenmemiş', () => {
    // Ödev Planlama hem Ödevler altında hem ayrı bir sekme olarak
    // dururken şerit iki kez aynı yere giderdi.
    //
    // Aile başlığının kendi hedefi ilk alt görünümüyle AYNI olmak
    // zorunda (yukarıdaki "zorunlu ara ekran" kuralı), bu yüzden o
    // bilinçli tekrar sayılmaz; geri kalan her hedef benzersiz olmalı.
    const hrefs: string[] = []
    for (const tab of TABS) {
      const items = tab.items ?? []
      if (tab.href && tab.href !== items[0]?.href) hrefs.push(tab.href)
      for (const item of items) if (item.href) hrefs.push(item.href)
    }
    const seen = new Set(hrefs)
    expect([...seen].length, `tekrar eden hedef: ${hrefs.join(', ')}`).toBe(
      hrefs.length
    )
  })
})

describe('activeStudentTab — Genel Bakış rotası (sorgu parametresi)', () => {
  it('sorgusuz kök Genel Bakış', () => {
    expect(activeStudentTab(TABS, BASE, null, BASE)).toBe('genel')
  })

  it('grup altındaki panel GRUBU işaretler', () => {
    // Yayınlanan Ödevler'deyken şeritte "Ödevler" yanmalı.
    expect(activeStudentTab(TABS, BASE, 'odevler', BASE)).toBe('odevler')
    expect(activeStudentTab(TABS, BASE, 'kitaplar', BASE)).toBe('kaynaklar')
    expect(activeStudentTab(TABS, BASE, 'veliler', BASE)).toBe('diger')
    expect(activeStudentTab(TABS, BASE, 'not', BASE)).toBe('diger')
  })

  it('durum şeritte yok — Haftalık Akış\'a taşındı', () => {
    // R7/05 §8: Durum Bildirimleri artık Haftalık Akış'ın alt sekmesi.
    // Şeritte kalsaydı aynı ekran iki yerden açılırdı. Eski
    // `?sekme=durum` bağlantıları sayfada yönlendiriliyor; bu fonksiyona
    // hiç ulaşmıyorlar, ulaşsalar da Genel Bakış'a düşmeleri doğru.
    expect(allHrefs().some(h => h.includes('sekme=durum'))).toBe(false)
    expect(activeStudentTab(TABS, BASE, 'durum', BASE)).toBe('genel')
  })

  it('tanınmayan sekme değeri Genel Bakışa düşer', () => {
    // Sayfa bu durumda özeti gösteriyor; şeritte hiçbir şeyin yanmaması
    // "buraya nasıl geldim" sorusunu doğururdu.
    expect(activeStudentTab(TABS, BASE, 'boyle-bir-sekme-yok', BASE)).toBe(
      'genel'
    )
  })
})

describe('activeStudentTab — alt rotalar (en uzun yol eşleşmesi)', () => {
  it('doğrudan sekmeler kendilerini işaretler', () => {
    const cases: [string, string][] = [
      ['haftalik-akis', 'haftalik-akis'],
      ['curriculum', 'akademik-akis'],
      ['gorusmeler', 'gorusmeler'],
      ['protection', 'koruma'],
      ['report', 'rapor'],
    ]
    for (const [path, key] of cases) {
      expect(activeStudentTab(TABS, `${BASE}/${path}`, null, BASE)).toBe(key)
    }
  })

  it('grup altındaki ekran GRUBU işaretler', () => {
    expect(activeStudentTab(TABS, `${BASE}/homework/new`, null, BASE)).toBe(
      'odevler'
    )
    expect(activeStudentTab(TABS, `${BASE}/goals`, null, BASE)).toBe(
      'kaynaklar'
    )
    expect(activeStudentTab(TABS, `${BASE}/edit`, null, BASE)).toBe('diger')
  })

  it('daha derin rotalar da üst ekranı işaretler', () => {
    expect(
      activeStudentTab(TABS, `${BASE}/protection/bir-konu`, null, BASE)
    ).toBe('koruma')
  })

  it('alt rotada Genel Bakış aktif GÖRÜNMEZ', () => {
    // Asıl regresyon: base her alt rotanın önekidir.
    for (const path of ['goals', 'curriculum', 'haftalik-akis', 'edit']) {
      expect(activeStudentTab(TABS, `${BASE}/${path}`, null, BASE)).not.toBe(
        'genel'
      )
    }
  })

  it('alt rotada sorgu parametresi yok sayılır', () => {
    // Kitap Haritası ekranları kendi ?scope= gibi parametrelerini
    // taşıyor; bunlar sekme seçimine karışmamalı.
    expect(activeStudentTab(TABS, `${BASE}/goals`, 'kitaplar', BASE)).toBe(
      'kaynaklar'
    )
  })

  it('tanınmayan alt rotada hiçbir sekme işaretlenmez', () => {
    expect(activeStudentTab(TABS, `${BASE}/bilinmeyen`, null, BASE)).toBe('')
  })
})

describe('R7/03 ad değişiklikleri', () => {
  it('Müfredat Akışı → Akademik Akış (yol değişmedi)', () => {
    const screen = studentScreens.find((s) => s.path === 'curriculum')
    expect(screen?.label).toBe('Akademik Akış')
    expect(screen?.slug).toBe('mufredat')
  })

  it('Haftalık Plan → Ödev Planlama (yol değişmedi)', () => {
    const screen = studentScreens.find((s) => s.path === 'homework/new')
    expect(screen?.label).toBe('Ödev Planlama')
  })

  it('panel etiketi şerit etiketiyle aynı', () => {
    // Panel etiketi sayfa başlığı olarak da basılıyor; ayrışırsa
    // "Öğretmen Hafızası"na tıklayan "Akademik Not" başlığı görür.
    const byHref = new Map<string, string>()
    for (const tab of TABS) {
      for (const item of tab.items ?? []) {
        if (item.href) byHref.set(item.href, item.label)
      }
      if (tab.href && !tab.items) byHref.set(tab.href, tab.label)
    }
    for (const panel of studentOverviewTabs) {
      const label = byHref.get(`${BASE}?sekme=${panel.slug}`)
      expect(label, `?sekme=${panel.slug} şeritte bulunamadı`).toBe(panel.label)
    }
  })
})
