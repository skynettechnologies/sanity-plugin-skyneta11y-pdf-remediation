import type {ReactNode} from 'react'

import {PER_PAGE_OPTIONS} from '../lib/format'
import {Icon} from './Icons'

export function SearchBox({
  value,
  placeholder,
  label,
  onChange,
}: {
  value: string
  placeholder: string
  label: string
  onChange: (value: string) => void
}) {
  return (
    <div className="search-box">
      <Icon name="search" size={16} />
      <input
        className="input"
        type="search"
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

export function PerPageSelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="filter-group">
      <label htmlFor={id}>Items per page</label>
      <select
        className="select select-arrow"
        id={id}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {PER_PAGE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  )
}

export function InlineProgress({active, progress}: {active: boolean; progress: number}) {
  if (!active) return null
  return (
    <div className="inline-progress">
      <div className="processing-label" style={{fontSize: 15.5}}>
        AI remediation in progress…
      </div>
      <div
        className="progress-track"
        style={{height: 9}}
        // The track/fill pair is styled by the module CSS; <progress> is not.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div className="progress-fill" style={{width: `${Math.max(progress, 4)}%`}} />
      </div>
    </div>
  )
}

export function BulkFooter({
  count,
  pages,
  children,
}: {
  count: number
  pages: number
  children: ReactNode
}) {
  return (
    <div className="bulk-footer">
      <span className="bulk-icon">
        <Icon name="doc" size={20} />
      </span>
      <div className="bulk-meta">
        <span>
          Selected: <b>{count}</b> documents
        </span>
        <span className="bulk-sep" />
        <span>
          Total: <b>{pages}</b> pages
        </span>
      </div>
      <div className="bulk-actions">{children}</div>
    </div>
  )
}

export function EmptyState({children}: {children: ReactNode}) {
  return <div className="empty-state">{children}</div>
}
