import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// AÇILIR MENÜ — MENÜ AÇILIRKEN ÇÖKME REGRESYONU.
//
// ============================================================
// NEDEN BU TEST VAR
//
// `DropdownMenuLabel` Base UI'ın `Menu.GroupLabel` parçasını kullanıyordu.
// O parça `<Menu.Group>` bağlamı olmadan çağrıldığında İSTİSNA FIRLATIYOR:
//
//   Base UI: MenuGroupContext is missing.
//   Menu group parts must be used within <Menu.Group> or <Menu.RadioGroup>.
//
// İstisna popup içeriği render edilirken oluştuğu için menü AÇILIR
// AÇILMAZ tüm sayfa hata sınırına düşüyordu. Üç menü birden bozuktu —
// çalışma alanı seçici, mobil kullanıcı menüsü ve kitap bölüm satır
// menüsü — ve hiçbiri etiketi gerçek bir grupla ilişkilendirmiyordu.
//
// Hata YALNIZ tıklama anında ortaya çıkıyor; hiçbir tip kontrolü ya da
// derleme adımı yakalamaz. Bu yüzden kural burada kaynak metni üzerinden
// kilitleniyor (repodaki *-sql-parity testleriyle aynı yöntem; jsdom
// kurulumu yok).
// ============================================================

const UI_PATH = join(process.cwd(), 'components/ui/dropdown-menu.tsx')
const SOURCE = readFileSync(UI_PATH, 'utf8')

/** `function X(...) { ... }` gövdesini kabaca ayıklar. */
function componentBody(name: string): string {
  const start = SOURCE.indexOf(`function ${name}(`)
  expect(start, `${name} bulunamadı`).toBeGreaterThan(-1)
  const next = SOURCE.indexOf('\nfunction ', start + 1)
  return SOURCE.slice(start, next === -1 ? undefined : next)
}

describe('DropdownMenuLabel bağlam gerektirmez', () => {
  it('Menu.GroupLabel kullanmaz', () => {
    expect(componentBody('DropdownMenuLabel')).not.toContain('MenuPrimitive.GroupLabel')
  })

  it('düz bir div render eder', () => {
    const body = componentBody('DropdownMenuLabel')
    expect(body).toContain('<div')
    expect(body).toContain('data-slot="dropdown-menu-label"')
  })
})

describe('Grup etiketi ayrı bir parça olarak durur', () => {
  it('DropdownMenuGroupLabel Menu.GroupLabel kullanır', () => {
    expect(componentBody('DropdownMenuGroupLabel')).toContain('MenuPrimitive.GroupLabel')
  })

  it('dışa aktarılır', () => {
    expect(SOURCE).toContain('DropdownMenuGroupLabel,')
  })
})

describe('Grup gerektiren parçalar grup dışında kullanılmaz', () => {
  // Bugün hiçbir çağıran DropdownMenuGroupLabel kullanmıyor. Biri
  // kullanmaya başlarsa, DropdownMenuGroup ile sarmaladığından emin
  // olunmalı — aksi hâlde aynı çökme geri gelir.
  const roots = ['app', 'components', 'lib']

  function walk(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) out.push(...walk(full))
      else if (entry.name.endsWith('.tsx')) out.push(full)
    }
    return out
  }

  const files = roots.flatMap(r => walk(join(process.cwd(), r)))

  it('DropdownMenuGroupLabel kullanan her dosya DropdownMenuGroup da kullanır', () => {
    const offenders = files.filter(f => {
      if (f.endsWith(join('components', 'ui', 'dropdown-menu.tsx'))) return false
      const src = readFileSync(f, 'utf8')
      return src.includes('<DropdownMenuGroupLabel') && !src.includes('<DropdownMenuGroup')
    })

    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
