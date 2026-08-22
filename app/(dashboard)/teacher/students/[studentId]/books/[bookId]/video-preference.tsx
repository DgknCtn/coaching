'use client'

// Video gösterim tercihi (R4 §6). Video hesap birimi değildir; bu tercih
// yalnızca öğrenciye nasıl sunulacağını belirler.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { BookMapBook } from '@/lib/book-map'
import { collectVideoResources } from '@/lib/book-videos'
import { BookVideoPanel } from '@/components/shared/book-video-panel'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { setVideoDisplayAction } from './target-actions'

export function VideoPreference({ studentId, book }: { studentId: string; book: BookMapBook }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [value, setValue] = useState(book.videoDisplay)

  const resources = collectVideoResources(book, new Set())
  if (resources.length === 0) return null

  const change = (next: string) => {
    setValue(next)
    startTransition(async () => {
      const result = await setVideoDisplayAction(
        studentId,
        book.bookId,
        book.assignmentId,
        next as 'resource' | 'weekly_reminder'
      )
      if (result?.error) {
        toast.error(result.error)
        setValue(book.videoDisplay)
        return
      }
      toast.success('Video tercihi güncellendi.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="videoDisplay">Video gösterimi</Label>
        <NativeSelect id="videoDisplay" value={value} onChange={(e) => change(e.target.value)}>
          <option value="resource">Kaynak olarak göster</option>
          <option value="weekly_reminder">Haftalık planda hatırlat</option>
        </NativeSelect>
      </div>
      <BookVideoPanel book={book} resources={resources} />
    </div>
  )
}
