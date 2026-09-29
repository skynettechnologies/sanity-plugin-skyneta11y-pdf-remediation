import {Icon} from '../components/Icons'
import {Pagination} from '../components/Pagination'
import {EmptyState, PerPageSelect, SearchBox} from '../components/TableParts'
import {formatDate} from '../lib/format'
import type {PdfDocument} from '../lib/types'
import type {TableViewProps} from './shared'

export interface RemediatedTabProps extends TableViewProps {
  source: string
  onSource: (value: string) => void
  downloading: Set<string>
  onDownload: (doc: PdfDocument, fileName: string) => void
}

const SOURCE_OPTIONS = [
  {value: 'all', label: 'All sources'},
  {value: 'file', label: 'Upload PDF'},
  {value: 'url', label: 'Scan PDF URL'},
  {value: 'web', label: 'Website Scan'},
]

function sourceLabel(source: string): string {
  if (source === 'web') return 'Website Scan'
  if (source === 'url') return 'Scan PDF URL'
  return 'Upload PDF'
}

export function RemediatedTab(props: RemediatedTabProps) {
  const {
    docs,
    total,
    page,
    perPage,
    search,
    onSearch,
    onPerPage,
    onPage,
    source,
    onSource,
    downloading,
    onDownload,
  } = props

  return (
    <section className="aiopdf-tab-panel">
      <div className="panel">
        <div className="filters-row">
          <h3 style={{fontSize: '1.5rem'}}>Remediated PDFs</h3>
          <div className="grow" />
          <SearchBox
            value={search}
            placeholder="Search remediated PDFs"
            label="Search remediated PDFs"
            onChange={onSearch}
          />
          <div className="filter-group">
            <select
              className="select select-arrow"
              aria-label="Filter by source"
              value={source}
              onChange={(event) => onSource(event.target.value)}
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <PerPageSelect id="aiopdfRemPerPage" value={perPage} onChange={onPerPage} />
        </div>

        {docs.length ? (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th className="text-center">Added From</th>
                  <th className="text-center">Remediated On</th>
                  <th className="text-center" style={{width: 100}}>
                    Pages
                  </th>
                  <th style={{width: 310, textAlign: 'right'}}>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => {
                  const name = doc.remediatedName || doc.name
                  return (
                    <tr key={doc.id}>
                      <td>
                        <div className="doc-cell">
                          <span className="mini-icon purple">PDF</span>
                          {name}
                        </div>
                      </td>
                      <td className="text-center">
                        <span className={`src-chip ${doc.source}`}>{sourceLabel(doc.source)}</span>
                      </td>
                      <td className="text-center">{formatDate(doc.remediatedAt)}</td>
                      <td className="text-center">
                        {doc.remediatedPages != null ? doc.remediatedPages : (doc.pages ?? '—')}
                      </td>
                      {/* Label text is nested deeper than the rule scans; markup is fixed by the module CSS. */}
                      {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label */}
                      <td className="actions-column" style={{textAlign: 'right'}}>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={downloading.has(doc.id)}
                            onClick={() => onDownload(doc, name)}
                          >
                            {downloading.has(doc.id) ? (
                              <Icon name="spinner" size={16} />
                            ) : (
                              <Icon name="download" size={16} />
                            )}{' '}
                            Download
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pagination page={page} perPage={perPage} total={total} onChange={onPage} />
          </div>
        ) : (
          <EmptyState>
            {search || source !== 'all'
              ? 'No remediated PDFs match your search/filter.'
              : 'No remediated PDFs yet — run AI remediation from the Upload or Website Scan tab.'}
          </EmptyState>
        )}
      </div>
    </section>
  )
}
