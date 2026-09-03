import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  Library,
  ListChecks,
  ShieldCheck,
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
  { href: '/teacher/books', label: 'Kitaplar', icon: BookOpen },
  { href: '/teacher/curriculum', label: 'Müfredat', icon: CalendarRange },
  { href: '/teacher/terms', label: 'Eğitim Dönemi', icon: CalendarDays },
]

/**
 * Öğrenci bağlamındaki gezinme (sol menünün ikinci grubu).
 *
 * Bu ekranlar öğrenciye özeldir — hepsi URL'de bir öğrenci id'si taşır. Bu
 * yüzden sabit bir dizi değil, id alan bir ÜRETİCİ: sidebar aktif öğrenciyi
 * URL'den çözer ve grubu yalnız o zaman gösterir.
 *
 * "Genel Bakış" exact işaretlidir; olmasaydı alt rotalarda (ör. /goals) hem
 * kendisi hem Genel Bakış aktif görünürdü.
 */
export function studentContextNav(studentId: string): NavItem[] {
  const base = `/teacher/students/${studentId}`
  return [
    { href: base, label: 'Genel Bakış', icon: LayoutDashboard, exact: true },
    { href: `${base}/curriculum`, label: 'Müfredat Akışı', icon: CalendarRange },
    { href: `${base}/goals`, label: 'Kaynak Planı', icon: Library },
    { href: `${base}/homework/new`, label: 'Haftalık Plan', icon: ListChecks },
    { href: `${base}/protection`, label: 'Koruma Havuzu', icon: ShieldCheck },
    { href: `${base}/report`, label: 'Rapor', icon: FileBarChart },
  ]
}

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
