interface PaginationProps {
  page: number
  perPage: number
  total: number
  onChange: (page: number) => void
}

/** "Showing x - y of z" plus a three-page window — port of renderPagination. */
export function Pagination({page, perPage, total, onChange}: PaginationProps) {
  const totalPages = Math.ceil(total / perPage) || 0
  const start = total === 0 ? 0 : (page - 1) * perPage + 1
  const end = Math.min(page * perPage, total)

  const startPage = Math.max(1, page - 1)
  const endPage = Math.min(totalPages, startPage + 2)
  const pages: number[] = []
  for (let i = startPage; i <= endPage; i += 1) pages.push(i)

  const first = page === 1
  const last = page === totalPages || totalPages === 0

  const go = (target: number) => {
    if (!target || target < 1 || target > totalPages || target === page) return
    onChange(target)
  }

  const item = (
    label: string,
    target: number,
    disabled: boolean,
    active = false,
    aria?: string,
  ) => (
    <li
      key={`${label}-${target}`}
      className={`page-item${disabled ? ' disabled' : ''}${active ? ' active' : ''}`}
    >
      <button
        type="button"
        className="page-link"
        disabled={disabled}
        aria-label={aria}
        aria-current={active ? 'page' : undefined}
        onClick={() => go(target)}
      >
        {label}
      </button>
    </li>
  )

  return (
    <div className="aiopdf_dashboard-table-pagination-main">
      <div className="record-count">
        <strong>
          Showing {start} - {end} of {total} item(s)
        </strong>
      </div>
      <ul className="pagination">
        {item('«', 1, first, false, 'First page')}
        {item('‹', page - 1, first, false, 'Previous page')}
        {pages.map((p) => item(String(p), p, false, p === page, `Page ${p}`))}
        {item('›', page + 1, last, false, 'Next page')}
        {item('»', totalPages || 1, last, false, 'Last page')}
      </ul>
    </div>
  )
}
