/**
 * The remediation account this Studio signs in as.
 *
 * Port of `js/account.js`. Somebody enters a real name, email and domain once,
 * and that is what the account is registered under. Nothing is sent to the
 * service until they submit. The details live in the browser's localStorage,
 * next to the session token they produce.
 *
 * `accountEmail` + `website` in the plugin options, when both are set, stand in
 * for a submitted dialog: the tool connects without asking.
 */
import type {ResolvedPdfConfig} from './config'
import type {PdfAccount, PdfAccountDraft, PdfAccountErrors} from './types'

export const ACCOUNT_STORAGE_KEY = 'aiopdf_account'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Normalises a domain the way the service wants it: a bare host, no scheme, no
 * port, no path. `https://Example.com:8080/docs` → `example.com`.
 */
export function normaliseDomain(value: unknown): string {
  let domain = text(value)
  if (!domain) return ''

  if (domain.includes('//')) {
    try {
      domain = new URL(domain).hostname
    } catch {
      domain = domain.split('//').pop() ?? ''
    }
  }

  const host = (domain.split('/')[0] ?? '').split('?')[0] ?? ''
  return host
    .replace(/:\d+$/, '')
    .replace(/^\.+|\.+$/g, '')
    .toLowerCase()
}

/** A complete account, or null. */
function shape(source: Partial<PdfAccount> | null | undefined): PdfAccount | null {
  if (!source) return null
  const account: PdfAccount = {
    name: text(source.name),
    email: text(source.email).toLowerCase(),
    domain: normaliseDomain(source.domain),
  }
  return account.name && account.email && account.domain ? account : null
}

/** The account saved from the dialog, or null if nobody has connected yet. */
export function readAccount(): PdfAccount | null {
  try {
    return shape(JSON.parse(window.localStorage.getItem(ACCOUNT_STORAGE_KEY) || 'null'))
  } catch {
    return null
  }
}

/** Persists a submitted account. Returns the normalised form, or null. */
export function writeAccount(values: Partial<PdfAccount>): PdfAccount | null {
  const account = shape(values)
  if (!account) return null
  try {
    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account))
  } catch {
    /* storage unavailable — the session still works until the tab closes */
  }
  return account
}

export function clearAccount(): void {
  try {
    window.localStorage.removeItem(ACCOUNT_STORAGE_KEY)
  } catch {
    /* nothing to clear */
  }
}

/** A pinned account from the plugin options, otherwise the dialog's. */
export function resolveAccount(config: ResolvedPdfConfig): PdfAccount | null {
  const pinned = shape({
    name: config.accountName || config.website,
    email: config.accountEmail,
    domain: config.website,
  })
  return pinned || readAccount()
}

/**
 * Values the dialog opens with.
 *
 * In the HTML build the domain defaulted to the page's hostname. Inside the
 * Studio that would be `*.sanity.studio`, so the discovered front-end domain
 * (see siteUrl.ts) and the logged-in Sanity user are used instead.
 */
export function accountDefaults(
  config: ResolvedPdfConfig,
  hints: {name?: string; email?: string; domain?: string},
): PdfAccountDraft {
  const stored = readAccount()
  if (stored) return stored

  return {
    name: text(config.accountName) || text(hints.name),
    email: text(config.accountEmail) || text(hints.email),
    domain: normaliseDomain(config.website || hints.domain || ''),
  }
}

/** Basic shape check, so an obvious typo is caught before the round trip. */
export function validateAccount(values: PdfAccountDraft): PdfAccountErrors {
  const errors: PdfAccountErrors = {}

  if (!text(values.name)) {
    errors.name = 'Enter the name this account should be registered under.'
  }

  const email = text(values.email)
  if (!email) {
    errors.email = 'Enter an email address.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'That does not look like an email address.'
  }

  const domain = normaliseDomain(values.domain)
  if (!domain) {
    errors.domain = 'Enter the website these PDFs belong to.'
  } else if (!domain.includes('.')) {
    errors.domain = 'Enter a full domain, such as example.com.'
  }

  return errors
}
