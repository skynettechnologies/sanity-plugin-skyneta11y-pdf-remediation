import {Icon} from '../components/Icons'
import {Pagination} from '../components/Pagination'
import {
  BulkFooter,
  EmptyState,
  InlineProgress,
  PerPageSelect,
  SearchBox,
} from '../components/TableParts'
import type {PdfDocument} from '../lib/types'
import type {SelectionProps, TableViewProps} from './shared'

export interface ScanTabProps extends TableViewProps, SelectionProps {
  /** What the crawl button will sweep — shown even before an account exists. */
  domain: string
  /** Domain currently being crawled, or empty. */
  crawling: string
  status: string
  onStatus: (value: string) => void
  onCrawl: () => void
  onScanNow: (id: string) => void
  onStart: () => void
}

const STATUS_OPTIONS = [
  {value: 'all', label: 'All status'},
  {value: 'scanning', label: 'Scanning'},
  {value: 'pending', label: 'Pending scan'},
  {value: 'ready', label: 'Pending'},
  {value: 'remediated', label: 'Remediated'},
]

function StatusChip({doc, onScanNow}: {doc: PdfDocument; onScanNow: (id: string) => void}) {
  switch (doc.status) {
    case 'scanning':
      return (
        <span className="status-chip scanning">
          <Icon name="spinner" size={13} /> Scanning
        </span>
      )
    case 'pending_scan':
      return (
        <button
          type="button"
          className="status-chip pending"
          style={{border: 'none', cursor: 'pointer'}}
          title="Click to scan now"
          onClick={() => onScanNow(doc.id)}
        >
          <Icon name="warning" size={13} /> Pending scan
        </button>
      )
    case 'ready':
      return (
        <span className="status-chip ready">
          <Icon name="info" size={12} /> Pending
        </span>
      )
    case 'processing':
      return (
        <span className="status-chip processing">
          <Icon name="spinner" size={13} /> Remediating
        </span>
      )
    case 'remediated':
      return (
        <span className="status-chip remediated">
          <Icon name="check" size={12} /> Remediated
        </span>
      )
    default:
      return <span className="status-chip error">Error</span>
  }
}

export function ScanTab(props: ScanTabProps) {
  const {
    docs,
    total,
    page,
    perPage,
    search,
    onSearch,
    onPerPage,
    onPage,
    selected,
    onToggle,
    onToggleAll,
    selectAllChecked,
    count,
    pages,
    busy,
    progress,
    domain,
    crawling,
    status,
    onStatus,
    onCrawl,
    onScanNow,
    onStart,
  } = props

  const emptyText = !domain
    ? 'Add a website domain to your account to start scanning it for PDFs.'
    : search || status !== 'all'
      ? 'No documents match your search/filter.'
      : `No scanned documents yet — click "Find PDFs on ${domain}" above.`

  return (
    <section className="aiopdf-tab-panel">
      <div className="panel">
        <div className="filters-row">
          {domain && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={Boolean(crawling) || busy}
              onClick={onCrawl}
            >
              {crawling ? (
                <>
                  <Icon name="spinner" size={15} /> Crawling {crawling}…
                </>
              ) : (
                `Find PDFs on ${domain}`
              )}
            </button>
          )}
          <div className="grow" />
          <div className="filters-actions">
            <SearchBox
              value={search}
              placeholder="Search documents"
              label="Search scanned documents"
              onChange={onSearch}
            />
            <div className="filter-group">
              <label htmlFor="aiopdfScanStatus">Status</label>
              <select
                className="select select-arrow"
                id="aiopdfScanStatus"
                value={status}
                onChange={(event) => onStatus(event.target.value)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <PerPageSelect id="aiopdfScanPerPage" value={perPage} onChange={onPerPage} />
          </div>
        </div>

        <InlineProgress active={busy} progress={progress} />

        {docs.length ? (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{width: 44}}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      aria-label="Select all documents"
                      checked={selectAllChecked}
                      onChange={(event) => onToggleAll(event.target.checked)}
                    />
                  </th>
                  <th>File Name / Source</th>
                  <th style={{width: 100, textAlign: 'center'}}>Pages</th>
                  <th style={{width: 160, textAlign: 'center'}}>Status</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={selected.has(doc.id)}
                        disabled={doc.status !== 'ready'}
                        aria-label={`Select ${doc.name}`}
                        onChange={(event) => onToggle(doc.id, event.target.checked)}
                      />
                    </td>
                    {/* Label text is nested deeper than the rule scans; markup is fixed by the module CSS. */}
                    {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label */}
                    <td>
                      <div className="doc-cell">
                        <span className="mini-icon">PDF</span>
                        <div style={{minWidth: 0}}>
                          {doc.name}
                          <span className="doc-sub">
                            Source:{' '}
                            {doc.sourceUrl ? (
                              <a href={doc.sourceUrl} target="_blank" rel="noreferrer">
                                {doc.sourceUrl}
                              </a>
                            ) : (
                              'Uploaded file'
                            )}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td style={{textAlign: 'center'}}>{doc.pages || '—'}</td>
                    <td style={{textAlign: 'center'}}>
                      <StatusChip doc={doc} onScanNow={onScanNow} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} perPage={perPage} total={total} onChange={onPage} />
          </div>
        ) : (
          <EmptyState>{emptyText}</EmptyState>
        )}

        <BulkFooter count={count} pages={pages}>
          <button
            type="button"
            className="btn btn-gradient"
            disabled={count === 0 || busy}
            onClick={onStart}
          >
            <Icon name="sparkles" size={20} /> Add Selected for Remediation
          </button>
        </BulkFooter>
      </div>
    </section>
  )
}
