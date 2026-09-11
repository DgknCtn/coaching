import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nextSegmentIndex } from '@/components/shared/segmented-field'

// ============================================================
// R7 GÖRSEL HİZALAMA — PAYLAŞILAN İLKELLER
//
// NEDEN BU TEST VAR
//
// Beş hedef ekranın tamamı aynı üç parçayı kullanıyor: halka gösterge,
// segmentli seçim ve arama kutusu. Her ekranın kendi kopyasını çizmesi,
// aynı yüzdenin iki kartta farklı görünmesi ve aynı tercihin iki formda
// farklı davranması demekti.
//
// Repoda jsdom kurulumu yok (vitest `node` ortamında koşuyor), bu yüzden
// klavye davranışı saf bir hesaba çıkarıldı; geri kalan kurallar kaynak
// metni üzerinden kilitleniyor (dropdown-menu.test.ts ile aynı yöntem).
// ============================================================

function source(relative: string): string {
  return readFileSync(join(process.cwd(), relative), 'utf8')
}

describe('nextSegmentIndex · ok tuşu gezinmesi', () => {
  it('sağ ok bir sonrakine gider', () => {
    expect(nextSegmentIndex(0, 1, 3)).toBe(1)
  })

  it('sol ok bir öncekine gider', () => {
    expect(nextSegmentIndex(2, -1, 3)).toBe(1)
  })

  it('son seçenekten sağ ok başa sarar', () => {
    // Sarmalama olmasaydı ok tuşu uçta sessizce hiçbir şey yapmayan bir
    // tuşa dönerdi.
    expect(nextSegmentIndex(2, 1, 3)).toBe(0)
  })

  it('ilk seçenekten sol ok sona sarar', () => {
    expect(nextSegmentIndex(0, -1, 3)).toBe(2)
  })

  it('değer listede yokken sağ ok ilk seçeneği seçer', () => {
    // findIndex -1 döndürüyor; kullanıcı yine de gezinebilmeli.
    expect(nextSegmentIndex(-1, 1, 3)).toBe(0)
  })

  it('değer listede yokken sol ok son seçeneği seçer', () => {
    expect(nextSegmentIndex(-1, -1, 3)).toBe(2)
  })

  it('boş listede çökmüyor', () => {
    expect(nextSegmentIndex(0, 1, 0)).toBe(-1)
    expect(nextSegmentIndex(-1, -1, 0)).toBe(-1)
  })

  it('tek seçenekte yerinde kalıyor', () => {
    expect(nextSegmentIndex(0, 1, 1)).toBe(0)
    expect(nextSegmentIndex(0, -1, 1)).toBe(0)
  })
})

describe('SegmentedField · erişilebilirlik kuralları', () => {
  const SRC = source('components/shared/segmented-field.tsx')

  it('radyo grubu olarak işaretlenmiş', () => {
    expect(SRC).toMatch(/role="radiogroup"/)
    expect(SRC).toMatch(/role="radio"/)
    expect(SRC).toMatch(/aria-checked=\{active\}/)
  })

  it('gruba sekme bir kez giriyor', () => {
    // Hepsi tabbable olsaydı yedi alanlı bir form on dört sekmeye
    // çıkardı.
    expect(SRC).toMatch(/tabIndex=\{active \? 0 : -1\}/)
  })

  it('dört ok tuşu da çalışıyor', () => {
    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
      expect(SRC).toContain(key)
    }
  })

  it('sayfa kaydırması engelleniyor', () => {
    // preventDefault olmadan yukarı/aşağı ok hem seçimi değiştirir hem
    // sayfayı kaydırırdı.
    expect(SRC).toMatch(/e\.preventDefault\(\)/)
  })
})

describe('ProgressRing · değer kırpma', () => {
  const SRC = source('components/shared/progress-ring.tsx')

  it('aralık dışı değerler kırpılıyor', () => {
    // ProgressBar ile AYNI kural: bozuk veri "%350 dolu" bir halka
    // çizdirmemeli.
    expect(SRC).toMatch(/Math\.max\(0, Math\.min\(100, Math\.round\(value \|\| 0\)\)\)/)
  })

  it('halka ekran okuyucudan gizli, yüzde metinde', () => {
    // Renk ve yay tek başına anlam taşımaz; sayı her zaman yazılı.
    expect(SRC).toMatch(/aria-hidden/)
    expect(SRC).toMatch(/%\{safe\}/)
  })

  it('semantik token kullanıyor, ham palet değil', () => {
    // Koyu/açık tema tokenlardan geliyor; sabit renk iki temadan birini
    // bozardı.
    expect(SRC).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(SRC).not.toMatch(/(stroke|text|bg)-(gray|slate|zinc|neutral|orange|red|green|blue)-\d/)
  })

  it('metric-tiles kendi halkasını çizmiyor', () => {
    // Halka üçüncü kez elle çizilirse aynı yüzde iki kartta farklı
    // görünür.
    const tiles = source('components/shared/metric-tiles.tsx')
    expect(tiles).toMatch(/import \{ ProgressRing \}/)
    expect(tiles).not.toMatch(/stroke-dasharray/)
  })
})

describe('SearchInput', () => {
  const SRC = source('components/shared/search-input.tsx')

  it('temizleme düğmesi yalnız değer varken çiziliyor', () => {
    // Boş kutunun yanındaki çarpı, basıldığında hiçbir şey yapmayan bir
    // düğmedir.
    expect(SRC).toMatch(/value !== ''/)
  })

  it('düğmelerin erişilebilir adı var', () => {
    expect(SRC).toMatch(/aria-label="Aramayı temizle"/)
    expect(SRC).toMatch(/aria-label=\{ariaLabel \?\? placeholder\}/)
  })

  it('ikon tıklamayı yutmuyor', () => {
    // pointer-events-none olmasaydı ikonun üstüne tıklamak kutuyu
    // odaklamazdı.
    expect(SRC).toMatch(/pointer-events-none/)
  })
})
