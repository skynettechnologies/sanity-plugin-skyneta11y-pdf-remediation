import type {PdfDocument} from '../lib/types'

/** A server-paginated table. */
export interface TableViewProps {
  docs: PdfDocument[]
  total: number
  page: number
  perPage: number
  /** The live value of the search box (debounced before it hits the API). */
  search: string
  onSearch: (value: string) => void
  onPerPage: (value: number) => void
  onPage: (page: number) => void
}

/** Selection spans the whole queue, not only the visible page. */
export interface SelectionProps {
  selected: Set<string>
  onToggle: (id: string, checked: boolean) => void
  onToggleAll: (checked: boolean) => void
  selectAllChecked: boolean
  /** Selected documents that are ready to remediate. */
  count: number
  /** Total pages across them. */
  pages: number
  /** True while a remediation job is running. */
  busy: boolean
  /** Job progress, 0–100. */
  progress: number
}
