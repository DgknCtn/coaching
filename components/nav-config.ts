import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  CreditCard,
  LifeBuoy,
  UserPlus,
  FileBarChart,
  LayoutDashboard,
  Library,
  ListChecks,
  Settings,
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

/**
 * Katlanabilir menü grubu.
 *
 * NEDEN AYRI TİP: bir grubun kendi `href`'i yok — tıklanınca bir yere
 * gitmez, açılır. `NavItem`'a isteğe bağlı `children` eklemek, her
 * tüketicinin "bu bir bağlantı mı yoksa grup mu" kontrolü yapmasını
 * gerektirirdi ve `href` alanı gruplarda anlamsız bir zorunluluk olarak
 * kalırdı.
 */
export interface NavGroup {
  /** Grup kimliği — açık/kapalı durumu bununla saklanır. */
  id: string
  label: string
  icon: LucideIcon
  items: NavItem[]
}

export type NavEntry = NavItem | NavGroup

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry
}

export const teacherNav: NavEntry[] = [
  { href: '/teacher', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  // ÖĞRENCİ İŞLERİ: öğrenciyle ilgili üç ekran tek başlık altında.
  //
  // Kitap Havuzu ve Müfredat Şablonları BİLİNÇLİ OLARAK DIŞARIDA:
  // adları öğrenci ekranlarındakilere benzese de bunlar çalışma alanı
  // seviyesi — bir kez kurulur, bütün öğrenciler için geçerlidir.
  // Gruba almak, "öğrenciye kitap atama" ile "havuza kitap ekleme"yi
  // aynı iş gibi gösterirdi.
  {
    id: 'ogrenci-isleri',
    label: 'Öğrenci İşleri',
    icon: Users,
    items: [
      { href: '/teacher/students', label: 'Öğrenciler', icon: Users, exact: true },
      { href: '/teacher/students/new', label: 'Yeni Öğrenci', icon: UserPlus },
      { href: '/teacher/tasks', label: 'Görevler', icon: ClipboardList },
    ],
  },
  { href: '/teacher/books', label: 'Kitaplar', icon: BookOpen },
  { href: '/teacher/curriculum', label: 'Müfredat', icon: CalendarRange },
  // YÖNETİM: günlük işin parçası olmayan üç ekran.
  //
  // Plan ve Destek'e öğretmen ayda bir bakar, Eğitim Dönemi'ne yılda
  // birkaç kez. Günlük kullanılan Öğrenci/Kitap/Müfredat ile aynı
  // düzeyde durmaları, sık kullanılanı seyreltiyordu.
  {
    id: 'yonetim',
    label: 'Yönetim',
    icon: Settings,
    items: [
      { href: '/teacher/terms', label: 'Eğitim Dönemi', icon: CalendarDays },
      // Plan yalnız SAHİBE anlamlı ama menüde herkese görünür: öğretmen
      // tıkladığında sayfa zaten yetki hatası verir. Menüyü role göre
      // budamak, ikinci bir yetki kaynağı yaratmak olurdu.
      { href: '/teacher/ayarlar/abonelik', label: 'Plan', icon: CreditCard },
      { href: '/teacher/destek', label: 'Destek', icon: LifeBuoy },
    ],
  },
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
  // R8: öğrenci artık kendi akademik planını da görebiliyor. Kitap haritası
  // menüye alınmadı — kitaba ödev kartından girilir, bağlam orada.
  { href: '/student/curriculum', label: 'Akışım', icon: CalendarRange },
  { href: '/student/review', label: 'Tekrar', icon: ShieldCheck },
]

// Veli panelinde tek ekran var; gezinme listesi bilinçli olarak boş.
export const parentNav: NavItem[] = []

/**
 * Rol -> nav eşlemesi. AppSidebar bunu KENDİSİ çözer; nav dizisi Server
 * Component'ten prop olarak geçirilemez, çünkü `icon` bir bileşen
 * fonksiyonudur ve fonksiyonlar RSC sınırından geçemez.
 */
export const navByRole: Record<Role, NavEntry[]> = {
  teacher: teacherNav,
  student: studentNav,
  parent: parentNav,
}
