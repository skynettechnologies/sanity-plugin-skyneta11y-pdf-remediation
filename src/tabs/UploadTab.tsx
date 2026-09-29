import {useRef, useState} from 'react'

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

export interface UploadTabProps extends TableViewProps, SelectionProps {
  uploading: boolean
  onFiles: (files: File[]) => void
  onRemove: (doc: PdfDocument) => void
  onRemoveSelected: () => void
  onStart: () => void
}

function PagesCell({doc}: {doc: PdfDocument}) {
  if (doc.status === 'pending_scan' || doc.status === 'scanning') {
    return <span className="status-chip scanning">Scanning…</span>
  }
  if (doc.status === 'processing') {
    return <span className="status-chip processing">Processing</span>
  }
  return <>{doc.pages == null ? '—' : doc.pages}</>
}

export function UploadTab(props: UploadTabProps) {
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
    uploading,
    onFiles,
    onRemove,
    onRemoveSelected,
    onStart,
  } = props

  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const hasSelection = count > 0

  const openPicker = () => fileInput.current?.click()

  return (
    <section className="aiopdf-tab-panel">
      {/* Drop zone */}
      <div className="panel">
        <div className="upload-split upload-split-single">
          <div
            className={`dropzone${dragging ? ' drag' : ''}`}
            style={{padding: '44px 16px'}}
            tabIndex={0}
            // A block-level drop target; the module CSS styles it as a div.
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
            role="button"
            aria-label="Drag and drop a PDF file here, or click to browse"
            onClick={openPicker}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openPicker()
              }
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              onFiles(Array.from(event.dataTransfer.files || []))
            }}
          >
            <div className="dz-icon">
              <Icon name="doc" size={26} />
            </div>
            <span>{uploading ? 'Uploading…' : 'Drag and Drop file here'}</span>
          </div>
        </div>

        <div className="dz-note" style={{marginTop: 0}}>
          <span>PDF format only</span>
          <span className="dot">&bull;</span>
          <span>Up to 50 MB</span>
          <span className="dot">&bull;</span>
          <span style={{color: 'var(--accent)'}}>Unencrypted files</span>
        </div>
        <div className="dz-subnote">Password-protected PDFs are not supported.</div>

        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(event) => {
            onFiles(Array.from(event.target.files || []))
            event.target.value = ''
          }}
        />
      </div>

      {/* Documents table */}
      <div className="panel table-panel">
        <div className="filters-row">
          <h3>Documents</h3>
          <div className="grow" />
          <SearchBox
            value={search}
            placeholder="Search documents"
            label="Search documents"
            onChange={onSearch}
          />
          <PerPageSelect id="aiopdfUploadPerPage" value={perPage} onChange={onPerPage} />
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
                  <th>File Name</th>
                  <th style={{textAlign: 'center'}}>Source</th>
                  <th style={{textAlign: 'center'}}>Pages</th>
                  <th style={{width: 280, textAlign: 'center'}}>Action</th>
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
                        <span className={`mini-icon${doc.source === 'url' ? ' link' : ''}`}>
                          {doc.source === 'url' ? <Icon name="link" size={16} /> : 'PDF'}
                        </span>
                        <div style={{minWidth: 0}}>
                          {doc.name}
                          {doc.sourceUrl && <span className="doc-sub">{doc.sourceUrl}</span>}
                        </div>
                      </div>
                    </td>
                    <td style={{textAlign: 'center'}}>
                      <span className={`src-chip ${doc.source}`}>
                        {doc.source === 'url' ? 'URL' : 'File'}
                      </span>
                    </td>
                    <td style={{textAlign: 'center'}}>
                      <PagesCell doc={doc} />
                    </td>
                    <td style={{textAlign: 'center'}}>
                      <div className="row-actions">
                        {doc.status !== 'processing' && (
                          <button
                            type="button"
                            className="link-danger"
                            disabled={hasSelection || busy}
                            onClick={() => onRemove(doc)}
                          >
                            <Icon name="x" size={14} /> Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} perPage={perPage} total={total} onChange={onPage} />
          </div>
        ) : (
          <EmptyState>
            {search
              ? 'No documents match your search.'
              : 'No documents in the queue — add a PDF above to get started.'}
          </EmptyState>
        )}

        <BulkFooter count={count} pages={pages}>
          <button
            type="button"
            className="btn btn-delete"
            disabled={!hasSelection || busy}
            onClick={onRemoveSelected}
          >
            <Icon name="trash" size={20} /> Remove Selected
          </button>
          <button
            type="button"
            className="btn btn-gradient"
            disabled={!hasSelection || busy}
            onClick={onStart}
          >
            <Icon name="sparkles" size={20} /> Add Selected for Remediation
          </button>
        </BulkFooter>
      </div>
    </section>
  )
}
