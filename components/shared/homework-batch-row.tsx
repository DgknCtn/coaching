import { Badge } from '@/components/ui/badge'
import { ProgressBar } from '@/components/shared/progress-bar'

interface HomeworkBatchRowProps {
  title: string | null
  dueDate: string
  completed: number
  total: number
  isOverdue: boolean
  /** Başlık yokken tarihin hangi biçimde yazılacağı. */
  dateStyle?: Intl.DateTimeFormatOptions
}

const defaultDateStyle: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
}

/**
 * ISO olmayan tarih dizeleri (ör. demo verisindeki "18 Haziran 2026") için
 * "Invalid Date" basmak yerine değeri olduğu gibi göster.
 */
function formatDate(value: string, style?: Intl.DateTimeFormatOptions) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('tr-TR', style)
}

export function HomeworkBatchRow({
  title,
  dueDate,
  completed,
  total,
  isOverdue,
  dateStyle = defaultDateStyle,
}: HomeworkBatchRowProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const isComplete = total > 0 && completed === total
  const label = title ?? formatDate(dueDate, dateStyle)

  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{label}</p>
          {isOverdue && <Badge variant="warning">Gecikmiş</Badge>}
          {isComplete && !isOverdue && <Badge variant="success">Tamamlandı</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Teslim: {formatDate(dueDate)}
        </p>
        {total > 0 && (
          <ProgressBar value={pct} label={`${label} ilerlemesi`} className="mt-2 max-w-[120px]" />
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm tabular-nums">
          {completed}
          <span className="text-muted-foreground">/{total}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">tamamlandı</p>
      </div>
    </div>
  )
}
