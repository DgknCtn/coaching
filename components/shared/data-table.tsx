import Link from 'next/link'
import { type LucideIcon } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  header: React.ReactNode
  align?: 'left' | 'center' | 'right'
  /** Dar ekranlarda gizlenecek ikincil kolonlar için. */
  hideBelow?: 'sm' | 'md' | 'lg'
  className?: string
  render: (row: T) => React.ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /**
   * Verilirse satırın tamamı tıklanabilir olur. Satıra `relative` verilip
   * ilk hücreye `absolute inset-0` bir Link serilir; `<tr>` içine `<a>`
   * koymak geçersiz HTML olacağı için sarmalama yerine bu desen kullanılır.
   * Erişilebilirlik için Link'e satırı tanımlayan bir etiket gerekir.
   */
  rowHref?: (row: T) => string
  rowLabel?: (row: T) => string
  empty?: {
    icon: LucideIcon
    title: string
    description?: string
    action?: { label: string; href?: string }
  }
  className?: string
}

const alignClass = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const

const hideClass = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
} as const

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  rowLabel,
  empty,
  className,
}: DataTableProps<T>) {
  if (!rows.length && empty) {
    return (
      <EmptyState
        icon={empty.icon}
        title={empty.title}
        description={empty.description}
        action={empty.action}
      />
    )
  }

  return (
    <Table className={className}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((c) => (
            <TableHead
              key={c.key}
              className={cn(
                alignClass[c.align ?? 'left'],
                c.hideBelow && hideClass[c.hideBelow],
                c.className
              )}
            >
              {c.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const href = rowHref?.(row)
          return (
            <TableRow
              key={rowKey(row)}
              className={cn('group/row', href && 'relative cursor-pointer')}
            >
              {columns.map((c, i) => (
                <TableCell
                  key={c.key}
                  className={cn(
                    alignClass[c.align ?? 'left'],
                    c.hideBelow && hideClass[c.hideBelow],
                    c.className
                  )}
                >
                  {href && i === 0 && (
                    <Link
                      href={href}
                      aria-label={rowLabel?.(row)}
                      className="absolute inset-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    />
                  )}
                  {c.render(row)}
                </TableCell>
              ))}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
