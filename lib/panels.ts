// PANELLER (B18) — saf tanımlar; sunucu ve istemci ortak kullanır.
//
// Bir kişi bir kurumda öğretmen, başka birinde veli, üçüncüsünde öğrenci
// olabilir. Seçici her "alan + panel" çiftini ayrı seçenek olarak
// gösterir; geçiş bu tablodaki rollerle doğrulanır.

export type PanelKind = 'teacher' | 'student' | 'parent'

export const PANEL_ROLES: Record<PanelKind, string[]> = {
  teacher: ['owner', 'teacher'],
  student: ['student'],
  parent: ['parent'],
}

export const PANEL_LABEL: Record<PanelKind, string> = {
  teacher: 'Öğretmen',
  student: 'Öğrenci',
  parent: 'Veli',
}

export function isPanelKind(value: unknown): value is PanelKind {
  return value === 'teacher' || value === 'student' || value === 'parent'
}
