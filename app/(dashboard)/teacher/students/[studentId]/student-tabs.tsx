'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { LinkTabs } from '@/components/shared/link-tabs'
import { activeStudentTab, studentTabs } from '@/components/nav-config'
import {
  LAST_STUDENT_COOKIE,
  LAST_STUDENT_MAX_AGE_SECONDS,
} from '@/lib/last-student'

/**
 * Öğrenci çalışma masasının sekme şeridi.
 *
 * NEDEN CLIENT: aktif sekme pathname ve sorgu dizesinden türetiliyor;
 * layout bir server component olduğu için ikisini de okuyamıyor.
 * Sekmelerin KENDİSİ yine de gerçek birer bağlantı (LinkTabs) —
 * paylaşılabilir, yer imlenebilir ve geri tuşuyla gezilebilir kalıyorlar;
 * client olan yalnız "hangisi aktif" kararı.
 *
 * SEKME LİSTESİ TEK KAYNAKTAN: studentContextNav (components/nav-config.ts)
 * hem Genel Bakış panellerini (?sekme=...) hem beş ekranı üretiyor. Burada
 * ikinci bir liste tutulsaydı, yeni bir sekme eklendiğinde biri
 * güncellenip diğeri unutulurdu.
 */
export function StudentTabs({ studentId }: { studentId: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabs = studentTabs(studentId)
  const base = `/teacher/students/${studentId}`

  // SON ÇALIŞILAN ÖĞRENCİ (bkz. lib/last-student.ts): menüden bir ekran
  // seçildiğinde öğrenci listesinin atlanabilmesi için. Çerez burada
  // yazılıyor çünkü layout'lar Next 15'te çerez yazamaz; değer bir
  // tercih olduğundan httpOnly olması da gerekmiyor.
  useEffect(() => {
    document.cookie = `${LAST_STUDENT_COOKIE}=${studentId}; path=/; max-age=${LAST_STUDENT_MAX_AGE_SECONDS}; SameSite=Lax`
  }, [studentId])

  // Aktif sekme kuralı nav-config.ts'te (activeStudentTab): saf ve test
  // edilebilir olsun diye. Burada yalnız adres çubuğu okunuyor.
  const activeKey = activeStudentTab(
    tabs,
    pathname,
    searchParams.get('sekme'),
    base
  )

  return (
    <LinkTabs
      tabs={tabs}
      activeKey={activeKey}
      ariaLabel="Öğrenci ekranları"
      className="px-6 md:px-8"
    />
  )
}
