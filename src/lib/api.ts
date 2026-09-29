/**
 * API layer for the AI PDF Remediation service.
 *
 * Port of `js/api.js`. Every request carries `Authorization: Bearer <token>`
 * when a token is known; an expired token is re-issued once, silently, on the
 * first 401. `/api/billing/plans` is public.
 */
import {resolveAccount} from './account'
import type {ResolvedPdfConfig} from './config'
import type {
  PdfAccount,
  PdfCrawlResult,
  PdfDocument,
  PdfDocumentsPage,
  PdfDocumentsQuery,
  PdfJob,
  PdfJobResponse,
  PdfPlan,
  PdfUser,
} from './types'

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export class PdfApiError extends Error {
  status: number
  code?: string
  data: Record<string, unknown>

  constructor(status: number, data?: Record<string, unknown> | null) {
    const serviceMessage = typeof data?.error === 'string' ? data.error : ''
    super(serviceMessage || 'Request failed')
    this.name = 'PdfApiError'
    this.status = status
    this.data = data || {}
    this.code = typeof this.data.code === 'string' ? this.data.code : undefined
  }
}

export function isPdfApiError(value: unknown): value is PdfApiError {
  return value instanceof PdfApiError
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** UTF-8 safe base64 — same output as `btoa(unescape(encodeURIComponent(s)))`. */
function base64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return window.btoa(binary)
}

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string | null): void {
  try {
    if (value) window.localStorage.setItem(key, value)
    else window.localStorage.removeItem(key)
  } catch {
    /* storage unavailable (private mode) */
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await res.json()
    return isRecord(data) ? data : {}
  } catch {
    return {}
  }
}

/** Smallest paid plan that covers `pages` — falls back to the largest one. */
export function recommendPlan(plans: PdfPlan[], pages: number): PdfPlan | null {
  const paid = (plans || []).filter((plan) => plan.price > 0)
  if (!paid.length) return null
  const sorted = [...paid].sort((a, b) => a.pages - b.pages)
  return sorted.find((plan) => plan.pages >= pages) ?? sorted[sorted.length - 1] ?? null
}

/* ------------------------------------------------------------------ *
 * Client
 * ------------------------------------------------------------------ */

export type PdfApi = ReturnType<typeof createPdfApi>

export function createPdfApi(config: ResolvedPdfConfig) {
  const account = () => resolveAccount(config)

  /** The site the remediation account is registered against. */
  const website = () => account()?.domain ?? ''

  /** The domain the Website Scan tab crawls, before the account's list. */
  const activeDomain = () => config.activeDomain || website()

  /**
   * Autologin link behind the upgrade buttons: `base64(domain|pf)`. The `|pf`
   * marker goes INSIDE the encoding so the dashboard lands on PDF plans.
   */
  const upgradeUrl = () => {
    if (config.upgradeUrl) return config.upgradeUrl
    const host = website()
    return host ? `${config.dashboardUrl}/front/autologin/${window.btoa(`${host}|pf`)}` : ''
  }

  const apiUrl = (path: string) =>
    `${config.apiBaseUrl}/api${path.startsWith('/') ? path : `/${path}`}`

  /* ---- Session token (scoped to the account it belongs to) ---- */

  const storageKey = () => {
    const identity = account()
    const fingerprint =
      config.accountKey || (identity ? `${identity.domain}|${identity.email}` : '')
    if (!fingerprint) return config.tokenKey
    return `${config.tokenKey}_${base64(fingerprint).replace(/=+$/, '')}`
  }

  const token = () => storageGet(storageKey())
  const setToken = (value: string | null) => storageSet(storageKey(), value)

  /** The job this browser last started, so a reload can resume it. */
  const activeJobId = () => storageGet(`${storageKey()}_job`)
  const setActiveJobId = (id: string | null) => storageSet(`${storageKey()}_job`, id)

  const authHeaders = (): Record<string, string> => {
    const value = token()
    return value ? {Authorization: `Bearer ${value}`} : {}
  }

  /** Clears tokens written under the bare `tokenKey`, which could be anyone's. */
  const reconcileAccount = () => {
    try {
      if (window.localStorage.getItem(config.tokenKey)) {
        window.localStorage.removeItem(config.tokenKey)
      }
      window.localStorage.removeItem(`${config.tokenKey}_account`)
    } catch {
      /* nothing to clean up */
    }
  }

  /* ---- Sign-in ---- */

  /**
   * POST /api/billing/provision-account — registers and signs in (idempotent).
   * Rejects on failure so the details dialog can show the service's reason.
   */
  const provisionSession = async (identity?: PdfAccount | null): Promise<boolean> => {
    const who = identity || account()
    if (!who) return false

    const res = await fetch(apiUrl('/billing/provision-account'), {
      method: 'POST',
      headers: {
        'X-Api-Key': config.provisionApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: who.name,
        email: who.email,
        company_name: who.name,
        website: who.domain,
        plan_id: config.planId,
        country: config.country,
      }),
    })
    const data = await readJson(res)
    if (!res.ok || typeof data.token !== 'string' || !data.token) {
      throw new PdfApiError(res.status, data)
    }
    setToken(data.token)
    return true
  }

  /** Asks a host-supplied server endpoint for a session instead. */
  const serverSession = async (): Promise<boolean> => {
    const headers: Record<string, string> = {Accept: 'application/json'}
    if (config.csrfToken) headers['X-CSRF-TOKEN'] = config.csrfToken
    try {
      const res = await fetch(config.sessionUrl, {
        method: 'POST',
        headers,
        credentials: 'same-origin',
      })
      if (!res.ok) return false
      const data = await readJson(res)
      if (typeof data.token !== 'string' || !data.token) return false
      setToken(data.token)
      return true
    } catch {
      return false
    }
  }

  /** Silent sign-in. Never rejects. */
  const signIn = async (): Promise<boolean> => {
    if (config.sessionUrl) return serverSession()
    try {
      return await provisionSession()
    } catch {
      return false
    }
  }

  /** True once a usable session exists. */
  const ensureSession = async (): Promise<boolean> => {
    reconcileAccount()
    if (token()) return true
    return signIn()
  }

  /* ---- Request plumbing ---- */

  interface RequestOptions {
    method?: string
    body?: BodyInit | null
    headers?: Record<string, string>
  }

  const request = async <T>(
    path: string,
    options: RequestOptions = {},
    isRetry = false,
  ): Promise<T> => {
    const headers: Record<string, string> = {...options.headers}
    const value = token()
    if (value) headers.Authorization = `Bearer ${value}`
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }

    const res = await fetch(apiUrl(path), {
      method: options.method || 'GET',
      body: options.body,
      headers,
    })
    const data = await readJson(res)
    // The service's JSON is typed at this single boundary; each endpoint below
    // reads its fields defensively (`?? []`, `?? null`).
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    if (res.ok) return data as T

    // One silent re-issue keeps a long-open Studio working.
    if (res.status === 401 && !isRetry) {
      setToken(null)
      const ok = await signIn()
      if (!ok) throw new PdfApiError(res.status, data)
      return request<T>(path, options, true)
    }

    throw new PdfApiError(res.status, data)
  }

  const get = <T>(path: string) => request<T>(path)
  const post = <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    })
  const del = <T>(path: string) => request<T>(path, {method: 'DELETE'})

  /* ---- Endpoints ---- */

  const fetchMe = async () => (await get<{user?: PdfUser}>('/auth/me')).user ?? null

  const fetchPlans = async () => (await get<{plans?: PdfPlan[]}>('/billing/plans')).plans ?? []

  /** Full unpaginated list — drives eligibility across the whole queue. */
  const fetchDocuments = async () =>
    (await get<{documents?: PdfDocument[]}>('/documents')).documents ?? []

  const fetchDocumentsPage = (params: PdfDocumentsQuery) => {
    const qs = new URLSearchParams()
    qs.set('type', params.type)
    qs.set('page', String(params.page))
    qs.set('perPage', String(params.perPage))
    if (params.search) qs.set('search', params.search)
    if (params.status && params.status !== 'all') qs.set('status', params.status)
    if (params.domain) qs.set('domain', params.domain)
    if (params.source && params.source !== 'all') qs.set('source', params.source)
    return get<PdfDocumentsPage>(`/documents?${qs.toString()}`)
  }

  const uploadPdf = async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return (await post<{document?: PdfDocument}>('/documents/upload', form)).document ?? null
  }

  const scanPdfUrl = async (id: string) =>
    (await post<{document?: PdfDocument}>(`/documents/${encodeURIComponent(id)}/scan`)).document ??
    null

  const crawlDomain = (domain: string) => post<PdfCrawlResult>('/documents/crawl', {domain})

  const removeDocument = async (id: string) => {
    await del(`/documents/${encodeURIComponent(id)}`)
    return id
  }

  const startRemediation = (documentIds: string[], allowPartial: boolean) =>
    post<PdfJobResponse & {job?: PdfJob}>('/remediation/start', {
      documentIds,
      allowPartial,
    })

  const pollJob = (jobId: string) =>
    get<PdfJobResponse>(`/remediation/jobs/${encodeURIComponent(jobId)}`)

  /** Fetched as a blob with the token attached, then saved by the browser. */
  const downloadRemediated = async (
    docId: string,
    fileName: string,
    isRetry = false,
  ): Promise<boolean> => {
    try {
      const res = await fetch(apiUrl(`/documents/${encodeURIComponent(docId)}/download`), {
        headers: authHeaders(),
      })
      if (res.status === 401 && !isRetry) {
        setToken(null)
        const ok = await signIn()
        return ok ? downloadRemediated(docId, fileName, true) : false
      }
      if (!res.ok) return false

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      return true
    } catch {
      return false
    }
  }

  return {
    website,
    activeDomain,
    upgradeUrl,
    apiUrl,
    storageKey,
    token,
    setToken,
    activeJobId,
    setActiveJobId,
    authHeaders,
    reconcileAccount,
    provisionSession,
    serverSession,
    signIn,
    ensureSession,
    fetchMe,
    fetchPlans,
    fetchDocuments,
    fetchDocumentsPage,
    uploadPdf,
    scanPdfUrl,
    crawlDomain,
    removeDocument,
    startRemediation,
    pollJob,
    downloadRemediated,
  }
}
