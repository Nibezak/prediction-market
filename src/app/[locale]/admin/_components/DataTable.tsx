'use client'

import type { ColumnDef, OnChangeFn, RowSelectionState, SortingState, VisibilityState } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useExtracted } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import { DataTableToolbar } from '@/app/[locale]/admin/_components/DataTableToolbar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { tableHeaderClass } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { DataTablePagination } from './DataTablePagination'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  totalCount: number
  searchPlaceholder?: string
  enableSelection?: boolean
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  enablePagination?: boolean
  enableColumnVisibility?: boolean
  isLoading?: boolean
  error?: string | null
  emptyMessage?: string
  emptyDescription?: string
  onRetry?: () => void
  // Server-side state handlers
  search: string
  onSearchChange: (search: string) => void
  sortBy: string | null
  sortOrder: 'asc' | 'desc' | null
  onSortChange: (column: string | null, order: 'asc' | 'desc' | null) => void
  pageIndex: number
  pageSize: number
  onPageChange: (pageIndex: number) => void
  onPageSizeChange: (pageSize: number) => void
  toolbarLeftContent?: ReactNode
  toolbarRightContent?: ReactNode
  searchInputClassName?: string
  searchLeadingIcon?: ReactNode
}

function useDataTableState<TData, TValue>({
  columns,
  data,
  totalCount,
  sortBy,
  sortOrder,
  onSortChange,
  pageIndex,
  pageSize,
  rowSelection: externalRowSelection,
  onRowSelectionChange: externalOnRowSelectionChange,
}: {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  totalCount: number
  sortBy: string | null
  sortOrder: 'asc' | 'desc' | null
  onSortChange: (column: string | null, order: 'asc' | 'desc' | null) => void
  pageIndex: number
  pageSize: number
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
}) {
  const [internalRowSelection, setInternalRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  const rowSelection = externalRowSelection ?? internalRowSelection
  const onRowSelectionChange = externalOnRowSelectionChange ?? setInternalRowSelection

  const sorting: SortingState = useMemo(() => {
    const dbToColumnMapping: Record<string, string> = {
      username: 'user',
      email: 'email',
      created_at: 'created',
    }

    const mappedColumnId = sortBy ? (dbToColumnMapping[sortBy] || sortBy) : null
    if (!mappedColumnId) {
      return []
    }

    const hasMappedColumn = columns.some((column) => {
      const columnId = typeof column.id === 'string' ? column.id : null
      const accessorKey = 'accessorKey' in column && column.accessorKey != null
        ? String(column.accessorKey)
        : null
      return columnId === mappedColumnId || accessorKey === mappedColumnId
    })

    const resolvedColumnId = hasMappedColumn ? mappedColumnId : sortBy
    return resolvedColumnId ? [{ id: resolvedColumnId, desc: sortOrder === 'desc' }] : []
  }, [columns, sortBy, sortOrder])

  const handleSortingChange = useCallback((updaterOrValue: any) => {
    const newSorting = typeof updaterOrValue === 'function' ? updaterOrValue(sorting) : updaterOrValue

    if (newSorting.length === 0) {
      onSortChange(null, null)
    }
    else {
      const sort = newSorting[0]
      onSortChange(sort.id, sort.desc ? 'desc' : 'asc')
    }
  }, [sorting, onSortChange])

  const table = useReactTable({
    data,
    columns,
    pageCount: totalCount > 0 ? Math.ceil(totalCount / pageSize) : -1,
    manualPagination: true,
    manualSorting: true,
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    onColumnVisibilityChange: Array.isArray(columnVisibility) ? columnVisibility[1] : setColumnVisibility,
    onRowSelectionChange,
    state: {
      sorting,
      columnVisibility: Array.isArray(columnVisibility) ? columnVisibility[0] : columnVisibility,
      rowSelection,
      pagination: {
        pageIndex,
        pageSize,
      },
    },
    onPaginationChange: () => {},
  })

  return { table }
}

export function DataTable<TData, TValue>({
  columns,
  data,
  totalCount,
  searchPlaceholder,
  enableSelection = false,
  rowSelection,
  onRowSelectionChange,
  enablePagination = true,
  enableColumnVisibility = true,
  isLoading = false,
  error = null,
  emptyMessage,
  emptyDescription,
  onRetry,
  search,
  onSearchChange,
  sortBy,
  sortOrder,
  onSortChange,
  pageIndex,
  pageSize,
  onPageChange,
  onPageSizeChange,
  toolbarLeftContent,
  toolbarRightContent,
  searchInputClassName,
  searchLeadingIcon,
}: DataTableProps<TData, TValue>) {
  const t = useExtracted()
  const resolvedSearchPlaceholder = searchPlaceholder ?? t('Search...')
  const resolvedEmptyMessage = emptyMessage ?? t('No entries found')
  const resolvedEmptyDescription = emptyDescription ?? t('There are no entries to display yet.')

  const { table } = useDataTableState({
    columns,
    data,
    totalCount,
    sortBy,
    sortOrder,
    onSortChange,
    pageIndex,
    pageSize,
    rowSelection,
    onRowSelectionChange,
  })

  if (error) {
    return (
      <div className="space-y-4">
        <DataTableToolbar
          search={search}
          onSearchChange={onSearchChange}
          searchPlaceholder={resolvedSearchPlaceholder}
          table={table}
          enableColumnVisibility={enableColumnVisibility}
          enableSelection={enableSelection}
          leftContent={toolbarLeftContent}
          rightContent={toolbarRightContent}
          searchInputClassName={searchInputClassName}
          searchLeadingIcon={searchLeadingIcon}
        />
        <div className="rounded-md border">
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-4 text-muted-foreground">
              <svg
                className="mx-auto size-12 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-medium text-foreground">{t('Something went wrong')}</h3>
            <p className="mb-4 text-sm text-muted-foreground">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className={cn(`
                  inline-flex items-center rounded-md border border-transparent bg-primary px-4 py-2 text-sm font-medium
                  text-white shadow-sm
                `)}
              >
                {t('Try again')}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <DataTableToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder={resolvedSearchPlaceholder}
        table={table}
        enableColumnVisibility={enableColumnVisibility}
        enableSelection={enableSelection}
        leftContent={toolbarLeftContent}
        rightContent={toolbarRightContent}
        searchInputClassName={searchInputClassName}
        searchLeadingIcon={searchLeadingIcon}
      />
      <div className="rounded-md border">
        <Table>
          <TableHeader className={tableHeaderClass}>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading
              ? (
                  Array.from({ length: pageSize }).map((_, index) => (
                    <TableRow key={index}>
                      {columns.map((column, colIndex) => (
                        <TableCell key={colIndex}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )
              : table.getRowModel().rows?.length
                ? (
                    table.getRowModel().rows.map(row => (
                      <TableRow
                        key={row.id}
                        data-state={row.getIsSelected() && 'selected'}
                      >
                        {row.getVisibleCells().map(cell => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )
                : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-32 text-center">
                        <div className="flex flex-col items-center justify-center space-y-1">
                          <p className="text-sm font-medium text-foreground">{resolvedEmptyMessage}</p>
                          <p className="text-xs text-muted-foreground">{resolvedEmptyDescription}</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
          </TableBody>
        </Table>
      </div>
      {enablePagination && (
        <DataTablePagination
          table={table}
          totalCount={totalCount}
        />
      )}
    </div>
  )
}
