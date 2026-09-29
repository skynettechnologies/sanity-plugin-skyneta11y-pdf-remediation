/**
 * AI PDF Accessibility Remediation — Sanity Studio workspace.
 *
 * React port of `js/app.js` from the HTML build: three tabs (Upload, Website
 * Scan, Remediated), the account dialog, the confirmation and plan-coverage
 * modals, and the job poller.
 *
 * The workspace is never gated behind sign-in. Account details are asked for
 * at the moment an action first has to reach the service (see
 * `requireAccount`): the first upload, or the first website scan.
 */
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useColorSchemeValue, useCurrentUser} from 'sanity'

import {Icon, LoaderGraphic} from './components/Icons'
import {
  AccountModal,
  ConfirmModal,
  CoverageModal,
  type ConfirmOptions,
  type CoverageState,
} from './components/Modals'
import {
  accountDefaults,
  clearAccount,
  normaliseDomain,
  resolveAccount,
  validateAccount,
  writeAccount,
} from './lib/account'
import {createPdfApi, isPdfApiError, recommendPlan, type PdfApi} from './lib/api'
import type {PdfTab, ResolvedPdfConfig} from './lib/config'
import {errorMessage, MAX_UPLOAD_BYTES, plural, SUBTITLES} from './lib/format'
import {DEFAULT_SITE_URL_TYPES, useSiteUrlHint} from './lib/siteUrl'
import type {
  PdfAccount,
  PdfAccountDraft,
  PdfAccountErrors,
  PdfDocument,
  PdfDocumentsQuery,
  PdfJob,
  PdfPlan,
  PdfUser,
} from './lib/types'
import {PDF_REMEDIATION_CSS} from './styles'
import {RemediatedTab} from './tabs/RemediatedTab'
import {ScanTab} from './tabs/ScanTab'
import {UploadTab} from './tabs/UploadTab'

/* ============================================================
   CONSTANTS + SMALL HELPERS
   ============================================================ */

/** Amber from here on: the plan is nearly gone. */
const PLAN_WARN_AT = 80
const JOB_POLL_MS = 1000
const TOAST_MS = 4200
const SEARCH_DEBOUNCE_MS = 350

type ToastKind = 'success' | 'error' | 'info' | ''

interface TableData {
  docs: PdfDocument[]
  total: number
}

const EMPTY_TABLE: TableData = {docs: [], total: 0}

const TAB_BUTTONS: {tab: PdfTab; label: string; icon: 'upload' | 'link' | 'doc'}[] = [
  {tab: 'upload', label: 'Upload', icon: 'upload'},
  {tab: 'scan', label: 'Website Scan', icon: 'link'},
  {tab: 'remediated', label: 'Remediated', icon: 'doc'},
]

type PendingAction = (account: PdfAccount, user: PdfUser | null) => void

/**
 * The domain the Website Scan tab crawls: the configured one when the account
 * actually owns it, otherwise the account's first registered domain.
 */
function pickActiveDomain(user: PdfUser | null, wanted: string): string {
  const domains = user?.domains ?? []
  if (wanted && domains.includes(wanted)) return wanted
  return domains[0] ?? ''
}

/** Injects the scoped stylesheet on mount and removes it on unmount. */
function usePdfAssets() {
  useEffect(() => {
    const style = document.createElement('style')
    style.dataset.aiopdfStyles = 'true'
    style.textContent = PDF_REMEDIATION_CSS
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, [])
}

/** Keeps a ref pointing at the latest value, for use inside timers. */
function useLatest<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}

/**
 * One server-paginated table. A `null` query means the table is not visible
 * (or there is no account yet) and it renders empty without fetching.
 */
function usePagedTable(
  api: PdfApi,
  query: PdfDocumentsQuery | null,
  refreshKey: number,
  loading: (on: boolean) => void,
  onError: (error: unknown, fallback: string) => void,
  errorText: string,
): TableData {
  const [data, setData] = useState<TableData>(EMPTY_TABLE)

  useEffect(() => {
    if (!query) return undefined
    let cancelled = false

    const run = async () => {
      loading(true)
      try {
        const res = await api.fetchDocumentsPage(query)
        if (!cancelled) setData({docs: res.documents ?? [], total: res.total ?? 0})
      } catch (error) {
        if (cancelled) return
        setData(EMPTY_TABLE)
        onError(error, errorText)
      } finally {
        loading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [api, query, refreshKey, loading, onError, errorText])

  return query ? data : EMPTY_TABLE
}

/* ============================================================
   COMPONENT
   ============================================================ */

export interface PdfRemediationPageProps {
  config: ResolvedPdfConfig
}

export default function PdfRemediationPage({config}: PdfRemediationPageProps) {
  usePdfAssets()

  const api = useMemo(() => createPdfApi(config), [config])
  const currentUser = useCurrentUser()
  const studioScheme = useColorSchemeValue()
  const theme = config.theme === 'auto' ? studioScheme : config.theme

  // Discovered front-end domain — only used to pre-fill the details dialog.
  const siteHint = useSiteUrlHint(
    config.website || undefined,
    config.siteUrlTypes ?? DEFAULT_SITE_URL_TYPES,
  )

  const scrollRef = useRef<HTMLDivElement>(null)

  /* ---------- Core state ---------- */
  const [tab, setTab] = useState<PdfTab>(config.initialTab)
  const [account, setAccount] = useState<PdfAccount | null>(() => resolveAccount(config))
  const [user, setUser] = useState<PdfUser | null>(null)
  const [plans, setPlans] = useState<PdfPlan[]>([])
  const [documents, setDocuments] = useState<PdfDocument[]>([])
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [job, setJob] = useState<PdfJob | null>(null)
  const [pollingJobId, setPollingJobId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const accountRef = useLatest(account)
  const userRef = useLatest(user)

  /* ---------- Account dialog ---------- */
  const [accountPrompt, setAccountPrompt] = useState<string | null>(null)
  const [draft, setDraft] = useState<PdfAccountDraft>({name: '', email: '', domain: ''})
  const [accountErrors, setAccountErrors] = useState<PdfAccountErrors>({})
  const [accountFailure, setAccountFailure] = useState('')
  const [accountSubmitting, setAccountSubmitting] = useState(false)
  const pendingAction = useRef<PendingAction | null>(null)
  /** Once the operator types, their draft wins over discovered defaults. */
  const draftTouched = useRef(false)

  /* ---------- Table views ---------- */
  const [uploadView, setUploadView] = useState({page: 1, perPage: 10, search: ''})
  const [uploadSearch, setUploadSearch] = useState('')

  const [scanView, setScanView] = useState({page: 1, perPage: 10, search: '', status: 'all'})
  const [scanSearch, setScanSearch] = useState('')

  const [remView, setRemView] = useState({page: 1, perPage: 10, search: '', source: 'all'})
  const [remSearch, setRemSearch] = useState('')

  /* ---------- UI ---------- */
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const [coverage, setCoverage] = useState<CoverageState | null>(null)
  const [coverageAccepted, setCoverageAccepted] = useState(false)
  const [loaders, setLoaders] = useState(0)
  const [toast, setToast] = useState<{message: string; kind: ToastKind} | null>(null)
  const [crawling, setCrawling] = useState('')
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState<Set<string>>(() => new Set())

  const toastTimer = useRef<number | undefined>(undefined)
  const completionTimer = useRef<number | undefined>(undefined)
  const crawlingRef = useRef(false)

  useEffect(
    () => () => {
      window.clearTimeout(toastTimer.current)
      window.clearTimeout(completionTimer.current)
    },
    [],
  )

  /* ============================================================
     SMALL ACTIONS
     ============================================================ */

  const showToast = useCallback((message: string, kind: ToastKind = '') => {
    setToast({message, kind})
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  /** Reference-counted so overlapping fetches do not hide each other's loader. */
  const loading = useCallback((on: boolean) => {
    setLoaders((count) => Math.max(0, count + (on ? 1 : -1)))
  }, [])

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), [])

  const handleRequestError = useCallback(
    (error: unknown, fallback: string) => {
      if (isPdfApiError(error) && error.status === 401) {
        showToast('Could not authenticate with the remediation service.', 'error')
        return
      }
      showToast(errorMessage(error) || fallback, 'error')
    },
    [showToast],
  )

  /** Keeps the full list in sync so eligibility survives a page change. */
  const reloadDocuments = useCallback(async () => {
    if (!accountRef.current) {
      setDocuments([])
      return
    }
    try {
      setDocuments(await api.fetchDocuments())
    } catch {
      /* the paginated tables still render — this list only gates selection */
    }
  }, [api, accountRef])

  const switchTab = useCallback(
    (next: PdfTab) => {
      setTab(next)
      setSelected(new Set())
      void reloadDocuments()
      refresh()
    },
    [reloadDocuments, refresh],
  )

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({top: 0, behavior: 'smooth'})
  }, [])

  /* ============================================================
     DERIVED
     ============================================================ */

  const activeDomain = useMemo(
    () => pickActiveDomain(user, account ? api.activeDomain() : ''),
    [user, account, api],
  )

  /** What the Website Scan tab shows it will crawl, connected or not. */
  const scanDomain = activeDomain || normaliseDomain(config.website || siteHint)

  const busy = Boolean(job && job.status === 'processing')
  const progress = job?.progress ?? 0

  const readyDocs = useMemo(() => {
    if (tab === 'scan') {
      return documents.filter(
        (doc) => doc.source === 'web' && doc.domain === activeDomain && doc.status === 'ready',
      )
    }
    return documents.filter((doc) => doc.source !== 'web' && doc.status === 'ready')
  }, [documents, tab, activeDomain])

  const selectedReady = useMemo(
    () => readyDocs.filter((doc) => selected.has(doc.id)),
    [readyDocs, selected],
  )
  const selectedPages = selectedReady.reduce((sum, doc) => sum + (doc.pages || 0), 0)

  /* ============================================================
     DEBOUNCED SEARCH
     ============================================================ */

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const value = uploadSearch.trim()
      setUploadView((view) => (view.search === value ? view : {...view, search: value, page: 1}))
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [uploadSearch])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const value = scanSearch.trim()
      setScanView((view) => (view.search === value ? view : {...view, search: value, page: 1}))
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [scanSearch])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const value = remSearch.trim()
      setRemView((view) => (view.search === value ? view : {...view, search: value, page: 1}))
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [remSearch])

  /* ============================================================
     TABLE LOADING — only the visible tab has a query
     ============================================================ */

  const uploadQuery = useMemo<PdfDocumentsQuery | null>(
    () => (account && tab === 'upload' ? {type: 'upload', ...uploadView} : null),
    [account, tab, uploadView],
  )
  const scanQuery = useMemo<PdfDocumentsQuery | null>(
    () =>
      account && activeDomain && tab === 'scan'
        ? {type: 'scan', ...scanView, domain: activeDomain}
        : null,
    [account, activeDomain, tab, scanView],
  )
  const remQuery = useMemo<PdfDocumentsQuery | null>(
    () => (account && tab === 'remediated' ? {type: 'remediated', ...remView} : null),
    [account, tab, remView],
  )

  const uploadData = usePagedTable(
    api,
    uploadQuery,
    refreshKey,
    loading,
    handleRequestError,
    'Could not load documents.',
  )
  const scanData = usePagedTable(
    api,
    scanQuery,
    refreshKey,
    loading,
    handleRequestError,
    'Could not load scanned documents.',
  )
  const remData = usePagedTable(
    api,
    remQuery,
    refreshKey,
    loading,
    handleRequestError,
    'Could not load remediated PDFs.',
  )

  const visibleDocs = tab === 'scan' ? scanData.docs : uploadData.docs
  const eligibleOnPage = visibleDocs.filter((doc) => doc.status === 'ready')
  const selectAllChecked =
    eligibleOnPage.length > 0 && eligibleOnPage.every((doc) => selected.has(doc.id))

  /* ============================================================
     BOOT — plans (public), then session + user + resumed job
     ============================================================ */

  useEffect(() => {
    let cancelled = false
    const loadPlans = async () => {
      try {
        const list = await api.fetchPlans()
        if (!cancelled) setPlans(list)
      } catch {
        if (!cancelled) setPlans([])
      }
    }
    void loadPlans()
    return () => {
      cancelled = true
    }
  }, [api])

  useEffect(() => {
    // No account yet: nothing to sign in as. The workspace waits for the first
    // upload or scan to ask (the account never goes back to null in the UI).
    if (!account) return undefined

    let cancelled = false

    const boot = async () => {
      loading(true)
      try {
        const ok = await api.ensureSession()
        if (!ok && !cancelled) showToast('Could not sign in to the remediation service.', 'error')

        const me = await api.fetchMe()
        if (cancelled) return
        setUser(me)

        // Pick a running job back up after a reload.
        const jobId = api.activeJobId()
        if (jobId) {
          try {
            const data = await api.pollJob(jobId)
            if (cancelled) return
            if (data.job && data.job.status === 'processing') {
              setJob(data.job)
              if (data.user) setUser(data.user)
              setPollingJobId(jobId)
            } else {
              api.setActiveJobId(null)
            }
          } catch {
            api.setActiveJobId(null)
          }
        }
      } catch {
        if (!cancelled) setUser(null)
      } finally {
        loading(false)
        if (!cancelled) {
          void reloadDocuments()
          refresh()
        }
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [account, api, loading, showToast, reloadDocuments, refresh])

  /* ============================================================
     JOB POLLING — once a second while a run is processing
     ============================================================ */

  useEffect(() => {
    if (!pollingJobId) return undefined

    let stopped = false
    let inFlight = false

    const stop = () => {
      stopped = true
      window.clearInterval(timer)
      setPollingJobId(null)
      api.setActiveJobId(null)
    }

    const tick = async () => {
      if (stopped || inFlight) return
      inFlight = true
      try {
        const data = await api.pollJob(pollingJobId)
        if (stopped) return
        const current = data.job ?? null
        setJob(current)
        if (data.user) setUser(data.user)

        if (current && current.status === 'completed') {
          stop()
          showToast('Remediation complete! Files are ready in the Remediated tab.', 'success')

          // The run spent pages, so re-read the plan meter.
          const refreshMeter = async () => {
            try {
              const me = await api.fetchMe()
              if (me) setUser(me)
            } catch {
              /* the count stays as it was until the next load */
            }
          }
          void refreshMeter()

          switchTab('remediated')
          window.clearTimeout(completionTimer.current)
          completionTimer.current = window.setTimeout(() => {
            setJob(null)
            refresh()
          }, 1200)
          return
        }

        if (!current || current.status !== 'processing') {
          stop()
          setJob(null)
          showToast('Remediation did not complete. Please try again.', 'error')
          void reloadDocuments()
          refresh()
        }
      } catch {
        if (stopped) return
        stop()
        setJob(null)
        void reloadDocuments()
        refresh()
      } finally {
        inFlight = false
      }
    }

    const timer = window.setInterval(() => void tick(), JOB_POLL_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [pollingJobId, api, showToast, switchTab, reloadDocuments, refresh])

  /* ============================================================
     ACCOUNT
     ============================================================ */

  const openAccountModal = useCallback(
    (prompt: string) => {
      if (!draftTouched.current) {
        setDraft(
          accountDefaults(config, {
            name: currentUser?.name,
            email: currentUser?.email,
            domain: siteHint,
          }),
        )
      }
      setAccountErrors({})
      setAccountFailure('')
      setAccountSubmitting(false)
      setAccountPrompt(prompt || 'Remediation runs under an account for your website.')
    },
    [config, currentUser, siteHint],
  )

  /** Closes the dialog, keeping whatever was typed. */
  const closeAccountModal = useCallback(() => {
    pendingAction.current = null
    setAccountPrompt(null)
  }, [])

  /**
   * Runs `action` when there is an account; otherwise asks for one first and
   * runs it once the dialog is answered.
   */
  const requireAccount = useCallback(
    (action: PendingAction, prompt: string) => {
      const current = accountRef.current
      if (current) {
        action(current, userRef.current)
        return
      }
      pendingAction.current = action
      openAccountModal(prompt)
    },
    [accountRef, userRef, openAccountModal],
  )

  /**
   * Registers the submitted details and makes them this Studio's account.
   * Stored *before* the call because the session token is filed under a key
   * derived from the account; a failure clears them again.
   */
  const submitAccount = useCallback(async () => {
    const errors = validateAccount(draft)
    setAccountErrors(errors)
    setAccountFailure('')
    if (Object.keys(errors).length) return

    setAccountSubmitting(true)
    try {
      const saved = writeAccount(draft)
      if (!saved) throw new Error('Enter a name, an email address and a domain.')

      try {
        await api.provisionSession(saved)
      } catch (error) {
        api.setToken(null)
        clearAccount()
        throw error
      }

      let me: PdfUser | null = null
      try {
        me = await api.fetchMe()
      } catch {
        /* the boot effect will try again */
      }

      const pending = pendingAction.current
      pendingAction.current = null

      setDraft(saved)
      setUser(me)
      setAccount(saved)
      setAccountPrompt(null)

      // Carry on with whatever they were doing when the dialog appeared.
      if (pending) pending(saved, me)
    } catch (error) {
      setAccountFailure(errorMessage(error) || 'Could not set this up. Please try again.')
    } finally {
      setAccountSubmitting(false)
    }
  }, [api, draft])

  /* ============================================================
     UPLOAD
     ============================================================ */

  const sendFiles = useCallback(
    async (files: File[]) => {
      setUploading(true)
      loading(true)
      try {
        const results = await Promise.all(
          files.map((file) =>
            api.uploadPdf(file).catch((error) => {
              handleRequestError(error, 'Upload failed')
              return null
            }),
          ),
        )
        const ok = results.filter(Boolean).length
        if (ok) showToast(`${plural(ok, 'file')} uploaded.`, 'success')
      } finally {
        setUploading(false)
        loading(false)
        void reloadDocuments()
        refresh()
      }
    },
    [api, loading, handleRequestError, showToast, reloadDocuments, refresh],
  )

  const handleFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return
      const accepted: File[] = []
      for (const file of files) {
        if (!/\.pdf$/i.test(file.name)) {
          showToast('PDF format only — please choose a .pdf file.', 'error')
          continue
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          showToast('File is too large. Up to 50 MB is allowed.', 'error')
          continue
        }
        accepted.push(file)
      }
      if (!accepted.length) return

      requireAccount(
        () => void sendFiles(accepted),
        `Before ${plural(accepted.length, 'file')} can be remediated, we need to know who this is for.`,
      )
    },
    [requireAccount, sendFiles, showToast],
  )

  /* ============================================================
     WEBSITE SCAN
     ============================================================ */

  const runCrawl = useCallback(
    async (domain: string) => {
      if (!domain || crawlingRef.current) return
      crawlingRef.current = true
      setCrawling(domain)

      try {
        const res = await api.crawlDomain(domain)
        const pagesCrawled = res.pagesCrawled ?? 0
        const sitemap = res.sitemapUrlsFound ?? 0
        const found = res.found ?? 0
        const added = res.added ?? 0

        const coverageText = `${pagesCrawled} page${pagesCrawled === 1 ? '' : 's'} crawled${
          sitemap > 0 ? `, ${sitemap} from sitemap` : ''
        }`

        // Large sites are swept across several runs.
        const truncated = res.truncated
          ? sitemap > 0
            ? ` — this is a large site (${sitemap} pages in its sitemap), so not every page could be checked in one pass; run it again to sweep the next part of the site.`
            : ' — this is a large site, so not every page could be checked in one pass; run it again to keep discovering more.'
          : ''

        const pdfs = `${found} PDF${found === 1 ? '' : 's'}`

        if (found === 0) {
          showToast(`No PDF links found on ${domain} (${coverageText}).${truncated}`)
        } else if (added === 0) {
          showToast(
            `Found ${pdfs} on ${domain} — all already in your list (${coverageText}).${truncated}`,
          )
        } else {
          showToast(
            `Found ${pdfs} on ${domain} — added ${added} new (${coverageText}). Scanning…${truncated}`,
            'success',
          )
          // Kick off the scan for each newly discovered document.
          const scanDiscovered = async () => {
            await Promise.all(
              (res.documents ?? []).map((doc) => api.scanPdfUrl(doc.id).catch(() => null)),
            )
            await reloadDocuments()
            refresh()
          }
          void scanDiscovered()
        }
      } catch (error) {
        handleRequestError(error, 'Could not crawl the website.')
      } finally {
        crawlingRef.current = false
        setCrawling('')
        void reloadDocuments()
        refresh()
      }
    },
    [api, showToast, handleRequestError, reloadDocuments, refresh],
  )

  const startCrawl = useCallback(() => {
    requireAccount(
      (acct, me) => {
        void runCrawl(pickActiveDomain(me, api.activeDomain()) || acct.domain)
      },
      `To scan ${scanDomain || 'your website'} for PDFs, we need to know which account the results belong to.`,
    )
  }, [requireAccount, runCrawl, api, scanDomain])

  const scanNow = useCallback(
    async (id: string) => {
      loading(true)
      try {
        await api.scanPdfUrl(id)
      } catch (error) {
        handleRequestError(error, 'Scan failed')
      } finally {
        loading(false)
        void reloadDocuments()
        refresh()
      }
    },
    [api, loading, handleRequestError, reloadDocuments, refresh],
  )

  /* ============================================================
     REMOVE
     ============================================================ */

  const removeDocuments = useCallback(
    async (ids: string[]) => {
      loading(true)
      try {
        await Promise.all(
          ids.map((id) =>
            api.removeDocument(id).catch((error) => {
              handleRequestError(error, 'Failed to remove document')
              return null
            }),
          ),
        )
      } finally {
        setSelected((prev) => {
          const next = new Set(prev)
          ids.forEach((id) => next.delete(id))
          return next
        })
        loading(false)
        void reloadDocuments()
        refresh()
      }
    },
    [api, loading, handleRequestError, reloadDocuments, refresh],
  )

  /* ============================================================
     REMEDIATION
     ============================================================ */

  const startRemediation = useCallback(
    async (allowPartial: boolean) => {
      if (!selectedReady.length) {
        showToast('Select at least one scanned document that is ready to remediate.', 'error')
        return
      }

      loading(true)
      try {
        const res = await api.startRemediation(
          selectedReady.map((doc) => doc.id),
          allowPartial,
        )
        setSelected(new Set())
        if (res.user) setUser(res.user)

        const next = res.job ?? null
        const processing = Boolean(next && next.status === 'processing')
        setJob(next)
        api.setActiveJobId(processing && next ? next.id : null)
        setPollingJobId(processing && next ? next.id : null)
        refresh()
      } catch (error) {
        if (
          isPdfApiError(error) &&
          (error.code === 'PAGE_LIMIT' || error.code === 'PARTIAL_REQUIRED')
        ) {
          setCoverage({
            covered: Number(error.data.pagesRemaining) || 0,
            total: Number(error.data.totalPages) || 0,
            message: error.message,
            isFree: user?.planId === 'free',
          })
          setCoverageAccepted(false)
        } else {
          handleRequestError(error, 'Could not start remediation.')
        }
      } finally {
        loading(false)
      }
    },
    [selectedReady, api, loading, showToast, handleRequestError, refresh, user],
  )

  const openUpgrade = useCallback(() => {
    const target = api.upgradeUrl()
    if (target) {
      window.open(target, '_blank', 'noopener,noreferrer')
    } else {
      showToast('Open the Plans page in the dashboard to upgrade.', 'info')
    }
  }, [api, showToast])

  /* ============================================================
     DOWNLOAD
     ============================================================ */

  const download = useCallback(
    async (doc: PdfDocument, fileName: string) => {
      setDownloading((prev) => new Set(prev).add(doc.id))
      const ok = await api.downloadRemediated(doc.id, fileName)
      setDownloading((prev) => {
        const next = new Set(prev)
        next.delete(doc.id)
        return next
      })
      if (!ok) showToast('Could not download this file.', 'error')
    },
    [api, showToast],
  )

  /* ============================================================
     SELECTION
     ============================================================ */

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev)
        visibleDocs
          .filter((doc) => doc.status === 'ready')
          .forEach((doc) => (checked ? next.add(doc.id) : next.delete(doc.id)))
        return next
      })
    },
    [visibleDocs],
  )

  /* ============================================================
     ESCAPE KEY
     ============================================================ */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setConfirm(null)
      setCoverage(null)
      if (!accountSubmitting) closeAccountModal()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [accountSubmitting, closeAccountModal])

  /* ============================================================
     RENDER — plan bar
     ============================================================ */

  const renderPlanBar = () => {
    if (!account || !user || !user.planName) return null

    const allowance = Number(user.planPages)
    const remaining = Math.max(0, Number(user.pagesRemaining) || 0)
    const metered = Number.isFinite(allowance) && allowance > 0
    const used = metered ? Math.min(allowance, Math.max(0, allowance - remaining)) : 0
    const percent = metered ? Math.min(100, Math.round((used / allowance) * 100)) : 0
    const tone = remaining <= 0 ? 'error' : percent >= PLAN_WARN_AT ? 'pending' : 'completed'
    const upgradeHref = api.upgradeUrl()

    return (
      <div className="aiopdf-plan-bar">
        <span className="status-chip ready">{user.planName}</span>
        {metered && (
          <span className={`status-chip ${tone}`}>
            {remaining.toLocaleString()} {remaining === 1 ? 'page remaining' : 'pages remaining'}
          </span>
        )}
        {upgradeHref && (
          <a
            className="btn btn-gradient btn-sm aiopdf-plan-upgrade"
            href={upgradeHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="crown" size={16} /> Upgrade
          </a>
        )}
      </div>
    )
  }

  const recommended = coverage ? recommendPlan(plans, coverage.total) : null

  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <div ref={scrollRef} className="aiopdf-studio-scroll">
      <div className="aiopdf-app aiopdf-embedded aiopdf-studio" data-theme={theme}>
        {/* ---------- Page title (gradient bar) ---------- */}
        <div className="aiopdf_dashboard-page-title-wrapper">
          <div className="aiopdf_dashboard-page-title">
            <h1>SkynetA11y PDF Accessibility Remediation</h1>
            <div className="subtitle">{SUBTITLES[tab]}</div>

            {account && (
              <div className="aiopdf-account-bar">
                <span>
                  <b>{account.domain}</b> · <span>{account.email}</span>
                </span>
              </div>
            )}

            {renderPlanBar()}
          </div>
        </div>

        {/* ---------- Tabs ---------- */}
        <div className="aiopdf_dashboard-pdf-remediation-type-list-tab">
          <ul role="tablist">
            {TAB_BUTTONS.map((item) => (
              <li key={item.tab}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === item.tab}
                  className={`aiopdf_btn${tab === item.tab ? ' aiopdf_btn-primary active' : ''}`}
                  onClick={() => switchTab(item.tab)}
                >
                  <span className="tab-ico">
                    <Icon name={item.icon} size={25} />
                  </span>{' '}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {tab === 'upload' && (
          <UploadTab
            docs={uploadData.docs}
            total={uploadData.total}
            page={uploadView.page}
            perPage={uploadView.perPage}
            search={uploadSearch}
            onSearch={setUploadSearch}
            onPerPage={(perPage) => setUploadView((view) => ({...view, perPage, page: 1}))}
            onPage={(page) => {
              setUploadView((view) => ({...view, page}))
              scrollToTop()
            }}
            selected={selected}
            onToggle={toggleOne}
            onToggleAll={toggleAll}
            selectAllChecked={selectAllChecked}
            count={selectedReady.length}
            pages={selectedPages}
            busy={busy}
            progress={progress}
            uploading={uploading}
            onFiles={handleFiles}
            onRemove={(doc) =>
              setConfirm({
                title: 'Remove Document',
                message: 'Are you sure you want to remove',
                itemName: `${doc.name || 'this document'}?`,
                onConfirm: () => void removeDocuments([doc.id]),
              })
            }
            onRemoveSelected={() => {
              const ids = selectedReady.map((doc) => doc.id)
              if (!ids.length) return
              setConfirm({
                title: 'Remove Document',
                message: 'Are you sure you want to remove the selected document?',
                onConfirm: () => void removeDocuments(ids),
              })
            }}
            onStart={() => void startRemediation(false)}
          />
        )}

        {tab === 'scan' && (
          <ScanTab
            docs={scanData.docs}
            total={scanData.total}
            page={scanView.page}
            perPage={scanView.perPage}
            search={scanSearch}
            onSearch={setScanSearch}
            onPerPage={(perPage) => setScanView((view) => ({...view, perPage, page: 1}))}
            onPage={(page) => {
              setScanView((view) => ({...view, page}))
              scrollToTop()
            }}
            status={scanView.status}
            onStatus={(status) => setScanView((view) => ({...view, status, page: 1}))}
            selected={selected}
            onToggle={toggleOne}
            onToggleAll={toggleAll}
            selectAllChecked={selectAllChecked}
            count={selectedReady.length}
            pages={selectedPages}
            busy={busy}
            progress={progress}
            domain={scanDomain}
            crawling={crawling}
            onCrawl={startCrawl}
            onScanNow={(id) => void scanNow(id)}
            onStart={() => void startRemediation(false)}
          />
        )}

        {tab === 'remediated' && (
          <RemediatedTab
            docs={remData.docs}
            total={remData.total}
            page={remView.page}
            perPage={remView.perPage}
            search={remSearch}
            onSearch={setRemSearch}
            onPerPage={(perPage) => setRemView((view) => ({...view, perPage, page: 1}))}
            onPage={(page) => {
              setRemView((view) => ({...view, page}))
              scrollToTop()
            }}
            source={remView.source}
            onSource={(source) => setRemView((view) => ({...view, source, page: 1}))}
            downloading={downloading}
            onDownload={(doc, name) => void download(doc, name)}
          />
        )}

        {/* ---------- Modals ---------- */}
        {accountPrompt !== null && (
          <AccountModal
            prompt={accountPrompt}
            draft={draft}
            errors={accountErrors}
            failure={accountFailure}
            submitting={accountSubmitting}
            onChange={(next) => {
              draftTouched.current = true
              setDraft(next)
              setAccountFailure('')
            }}
            onSubmit={() => void submitAccount()}
            onClose={closeAccountModal}
          />
        )}

        {confirm && <ConfirmModal options={confirm} onClose={() => setConfirm(null)} />}

        {coverage && (
          <CoverageModal
            state={coverage}
            plan={recommended}
            accepted={coverageAccepted}
            onAcceptChange={setCoverageAccepted}
            onUpgrade={openUpgrade}
            onContinue={() => {
              setCoverage(null)
              void startRemediation(true)
            }}
            onClose={() => setCoverage(null)}
          />
        )}

        {/* ---------- Full-screen loader ---------- */}
        {loaders > 0 && (
          <div className="aioa_dashboard-fullscreen-loader" role="alert" aria-live="polite">
            <div className="aioa_dashboard-loader">
              <LoaderGraphic />
              <span className="visually-hidden">Loading page…</span>
            </div>
          </div>
        )}

        {/* ---------- Toast ---------- */}
        {toast && (
          <output className={`toast${toast.kind ? ` ${toast.kind}` : ''}`} aria-live="polite">
            {toast.message}
          </output>
        )}
      </div>
    </div>
  )
}
