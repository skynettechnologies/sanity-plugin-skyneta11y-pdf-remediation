export {AiPdfRemediation, PLUGIN_NAME} from './plugin'
export type {AiPdfRemediationConfig} from './plugin'

export {default as PdfRemediationPage} from './PdfRemediationPage'
export type {PdfRemediationPageProps} from './PdfRemediationPage'

export {DEFAULT_PDF_CONFIG, PDF_TABS, resolvePdfConfig} from './lib/config'
export type {PdfRemediationOptions, PdfTab, ResolvedPdfConfig} from './lib/config'

export {createPdfApi, isPdfApiError, PdfApiError, recommendPlan} from './lib/api'
export type {PdfApi} from './lib/api'

export {
  ACCOUNT_STORAGE_KEY,
  accountDefaults,
  clearAccount,
  normaliseDomain,
  readAccount,
  resolveAccount,
  validateAccount,
  writeAccount,
} from './lib/account'

export type {
  PdfAccount,
  PdfAccountDraft,
  PdfAccountErrors,
  PdfCrawlResult,
  PdfDocument,
  PdfDocumentSource,
  PdfDocumentStatus,
  PdfDocumentsPage,
  PdfDocumentsQuery,
  PdfJob,
  PdfJobResponse,
  PdfPlan,
  PdfUser,
} from './lib/types'

export {PDF_REMEDIATION_CSS} from './styles'
