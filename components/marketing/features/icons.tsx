import { BookOpen, CalendarDays, ClipboardList, HeartHandshake, MessageCircle, Smartphone, Users, Wallet } from 'lucide-react'
import type { CategoryIcon } from '@/lib/features/catalog'

export const CATEGORY_ICON: Record<CategoryIcon, typeof Users> = {
  users: Users,
  clipboard: ClipboardList,
  book: BookOpen,
  smartphone: Smartphone,
  parent: HeartHandshake,
  calendar: CalendarDays,
  wallet: Wallet,
  message: MessageCircle,
}
