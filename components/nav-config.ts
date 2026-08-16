import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Yalnızca tam eşleşmede aktif say (dashboard kökleri için). */
  exact?: boolean
}

export const teacherNav: NavItem[] = [
  { href: '/teacher', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/teacher/students', label: 'Öğrenciler', icon: Users },
  { href: '/teacher/books', label: 'Kitap Havuzu', icon: BookOpen },
  { href: '/teacher/terms', label: 'Eğitim Dönemi', icon: CalendarDays },
]

export const studentNav: NavItem[] = [
  { href: '/student', label: 'Ödevlerim', icon: ClipboardList, exact: true },
]

// Veli panelinde tek ekran var; gezinme listesi bilinçli olarak boş.
export const parentNav: NavItem[] = []
