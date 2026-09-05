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
  ShieldCheck,
  Users,
  Wallet,
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

/**
 * Öğrenci ekranları — TEK KAYNAK.
 *
 * Aynı beş ekran menüde iki yerde görünüyor:
 *  1) Bir öğrenci açıkken, o öğrencinin altında (studentContextNav),
 *  2) Öğrenci seçili değilken ana menüde bir grup olarak
 *     (studentScreensGroup) — bağlantı öğrenci listesine gider, seçim
 *     yapılınca doğrudan istenen ekrana girilir.
 *
 * `slug` URL'de taşınan kimlik (?ekran=...), `path` öğrenci altındaki
 * gerçek yol. İkisi ayrı tutuluyor: "homework/new" gibi bir yol sorgu
 * değerinde okunaksız kalırdı.
 */
export const studentScreens = [
  { slug: 'mufredat', path: 'curriculum', label: 'Müfredat Akışı', icon: CalendarRange },
  { slug: 'kaynak', path: 'goals', label: 'Kaynak Planı', icon: Library },
  { slug: 'haftalik', path: 'homework/new', label: 'Haftalık Plan', icon: ListChecks },
  { slug: 'koruma', path: 'protection', label: 'Koruma Havuzu', icon: ShieldCheck },
  { slug: 'rapor', path: 'report', label: 'Rapor', icon: FileBarChart },
] as const

export type StudentScreen = (typeof studentScreens)[number]

/** ?ekran= değerini doğrular; tanınmayan değer için null döner. */
export function studentScreenBySlug(slug: string | undefined): StudentScreen | null {
  if (!slug) return null
  return studentScreens.find((s) => s.slug === slug) ?? null
}

/**
 * Ekranların öğrenci SEÇİLMEMİŞKEN görünen hâli. Hedef öğrenci
 * listesidir: liste sayfası ?ekran= değerini okur ve satır bağlantılarını
 * doğrudan o ekrana yöneltir. Böylece menü, hangi sayfada olunursa olsun
 * aynı beş satırı gösterir.
 */
export const studentScreensGroup: NavGroup = {
  id: 'ogrenci-ekranlari',
  label: 'Öğrenci Ekranları',
  icon: CalendarRange,
  items: studentScreens.map((s) => ({
    href: `/teacher/students?ekran=${s.slug}`,
    label: s.label,
    icon: s.icon,
  })),
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
  studentScreensGroup,
  // EĞİTİM DÖNEMİ / PLAN / DESTEK ARTIK DÜZ SEVİYEDE.
  //
  // Önce "Yönetim" adlı katlanabilir bir grubun altındaydılar. Grup,
  // seyrek kullanılan ekranları toplamak için kurulmuştu ama ters
  // çalıştı: üçü de menüde hiç görünmüyordu, kullanıcı önce
  // "Yönetim"in ne içerdiğini tahmin edip açmak zorundaydı. Üç öğe
  // için bir tıklama ve bir tahmin, kazandırdığı derli topluluktan
  // pahalı.
  // FİNANS her öğretmene GÖRÜNÜR ama yalnız sahibe açıktır (066).
  // Menüyü role göre budamak, Plan bağlantısında olduğu gibi yetkinin
  // ikinci bir kaynağını yaratırdı; sayfanın kendisi neden
  // giremediğini zaten açıklıyor.
  { href: '/teacher/finans', label: 'Finans', icon: Wallet },
  { href: '/teacher/terms', label: 'Eğitim Dönemi', icon: CalendarDays },
  // Plan yalnız SAHİBE anlamlı ama menüde herkese görünür: öğretmen
  // tıkladığında sayfa zaten yetki hatası verir. Menüyü role göre
  // budamak, ikinci bir yetki kaynağı yaratmak olurdu.
  { href: '/teacher/ayarlar/abonelik', label: 'Plan', icon: CreditCard },
  { href: '/teacher/destek', label: 'Destek', icon: LifeBuoy },
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
    ...studentScreens.map((s) => ({
      href: `${base}/${s.path}`,
      label: s.label,
      icon: s.icon,
    })),
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
