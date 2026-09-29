/** Shapes returned by the AI PDF Remediation service. */

export type PdfDocumentSource = 'file' | 'url' | 'web' | (string & {})

export type PdfDocumentStatus =
  | 'pending_scan'
  | 'scanning'
  | 'ready'
  | 'processing'
  | 'remediated'
  | 'error'
  | (string & {})

export interface PdfDocument {
  id: string
  name: string
  source: PdfDocumentSource
  status: PdfDocumentStatus
  pages?: number | null
  sourceUrl?: string | null
  domain?: string | null
  remediatedName?: string | null
  remediatedAt?: string | null
  remediatedPages?: number | null
}

export interface PdfUser {
  planId?: string
  planName?: string
  planPages?: number
  pagesRemaining?: number
  domains?: string[]
  [key: string]: unknown
}

export interface PdfPlan {
  id?: string
  name: string
  pages: number
  price: number
  [key: string]: unknown
}

export interface PdfJob {
  id: string
  status: 'processing' | 'completed' | 'failed' | (string & {})
  progress?: number
}

export interface PdfDocumentsPage {
  documents?: PdfDocument[]
  total?: number
}

export interface PdfCrawlResult {
  found: number
  added: number
  pagesCrawled: number
  sitemapUrlsFound: number
  truncated?: boolean
  documents?: PdfDocument[]
}

export interface PdfJobResponse {
  job?: PdfJob | null
  user?: PdfUser | null
}

export interface PdfAccount {
  name: string
  email: string
  domain: string
}

export type PdfAccountDraft = PdfAccount

export type PdfAccountErrors = Partial<Record<keyof PdfAccount, string>>

export interface PdfDocumentsQuery {
  type: 'upload' | 'scan' | 'remediated'
  page: number
  perPage: number
  search?: string
  status?: string
  domain?: string
  source?: string
}
