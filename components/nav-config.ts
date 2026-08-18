import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type Role = 'teacher' | 'student' | 'parent'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Yalnızca tam eşleşmede aktif say (dashboard kökleri için). */
  exact?: boolean
}

export const teacherNav: NavItem[] = [
  { href: '/teacher', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/teacher/tasks', label: 'Görevler', icon: ClipboardList },
  { href: '/teacher/students', label: 'Öğrenciler', icon: Users },
  { href: '/teacher/books', label: 'Kitap Havuzu', icon: BookOpen },
  { href: '/teacher/terms', label: 'Eğitim Dönemi', icon: CalendarDays },
]

export const studentNav: NavItem[] = [
  { href: '/student', label: 'Ödevlerim', icon: ClipboardList, exact: true },
]

// Veli panelinde tek ekran var; gezinme listesi bilinçli olarak boş.
export const parentNav: NavItem[] = []

/**
 * Rol -> nav eşlemesi. AppSidebar bunu KENDİSİ çözer; nav dizisi Server
 * Component'ten prop olarak geçirilemez, çünkü `icon` bir bileşen
 * fonksiyonudur ve fonksiyonlar RSC sınırından geçemez.
 */
export const navByRole: Record<Role, NavItem[]> = {
  teacher: teacherNav,
  student: studentNav,
  parent: parentNav,
}
