/**
 * AI PDF Accessibility Remediation — configuration.
 *
 * Port of `js/config.js` from the HTML build. Instead of editing a file or
 * setting `window.AIOPDF_CONFIG`, every value is passed as a plugin option in
 * `sanity.config.ts`. Anything left out keeps the default below. An empty
 * string means "derive it" — the comment on each field says from what.
 */

export type PdfTab = 'upload' | 'scan' | 'remediated'

export const PDF_TABS: PdfTab[] = ['upload', 'scan', 'remediated']

/** Options accepted by the plugin. All optional. */
export interface PdfRemediationOptions {
  /** Origin of the AI PDF Remediation backend. */
  apiBaseUrl?: string

  /**
   * Key for the provisioning endpoint, sent as `X-Api-Key`.
   *
   * SECURITY: the Studio is a browser app, so this key is readable by anyone
   * who can load the Studio. That is acceptable because the Studio sits behind
   * Sanity login. If the key must never leave your server, set `sessionUrl`
   * instead and remove this value.
   */
  provisionApiKey?: string

  /** Name the account is registered under. Pre-fills the details dialog. */
  accountName?: string
  /** Email the account is provisioned under. Pre-fills the details dialog. */
  accountEmail?: string
  /**
   * Site the account is registered against. Pre-fills the details dialog.
   * Setting BOTH `accountEmail` and `website` pins the account and skips the
   * dialog entirely.
   */
  website?: string

  /** Domain the Website Scan tab crawls. Empty follows the account. */
  activeDomain?: string

  /** Plan new accounts are provisioned on. */
  planId?: string
  /** Two-letter country code recorded on the account. */
  country?: string

  /** Dashboard the upgrade buttons link to. */
  dashboardUrl?: string
  /** Ready-made autologin link. Empty builds one from the account's domain. */
  upgradeUrl?: string

  /** Server-side session endpoint. When set, `provisionApiKey` is never used. */
  sessionUrl?: string
  /** CSRF token for `sessionUrl`, when it requires one. */
  csrfToken?: string

  /** Fingerprint scoping the cached session token. Empty derives it. */
  accountKey?: string

  /** Tab opened when the tool loads. */
  initialTab?: PdfTab

  /** localStorage key the session token lives under. */
  tokenKey?: string

  /**
   * Visual theme of the workspace. `auto` (default) follows the Studio's
   * light/dark scheme.
   */
  theme?: 'auto' | 'light' | 'dark'

  /**
   * Document types searched for a site URL field, used to pre-fill the domain
   * in the details dialog. Defaults to common settings type names.
   */
  siteUrlTypes?: string[]
}

export type ResolvedPdfConfig = Required<Omit<PdfRemediationOptions, 'siteUrlTypes'>> & {
  siteUrlTypes?: string[]
}

export const DEFAULT_PDF_CONFIG: ResolvedPdfConfig = {
  apiBaseUrl: 'https://livepdfapi.skynettechnologies.us',
  provisionApiKey: 'PDF-REMEDATION-PLAN-CHECK',
  accountName: '',
  accountEmail: '',
  website: '',
  activeDomain: '',
  planId: 'free',
  country: 'US',
  dashboardUrl: 'https://ada.skynettechnologies.us',
  upgradeUrl: '',
  sessionUrl: '',
  csrfToken: '',
  accountKey: '',
  initialTab: 'upload',
  tokenKey: 'aiopdf_token',
  theme: 'auto',
  siteUrlTypes: undefined,
}

/** Merges plugin options over the defaults. `undefined`/`null` keep the default. */
export function resolvePdfConfig(options?: PdfRemediationOptions | null): ResolvedPdfConfig {
  const o: PdfRemediationOptions = options ?? {}
  const d = DEFAULT_PDF_CONFIG
  const initialTab = o.initialTab && PDF_TABS.includes(o.initialTab) ? o.initialTab : d.initialTab
  const theme = o.theme === 'light' || o.theme === 'dark' ? o.theme : d.theme

  return {
    apiBaseUrl: (o.apiBaseUrl ?? d.apiBaseUrl).replace(/\/+$/, ''),
    provisionApiKey: o.provisionApiKey ?? d.provisionApiKey,
    accountName: o.accountName ?? d.accountName,
    accountEmail: o.accountEmail ?? d.accountEmail,
    website: o.website ?? d.website,
    activeDomain: o.activeDomain ?? d.activeDomain,
    planId: o.planId ?? d.planId,
    country: o.country ?? d.country,
    dashboardUrl: (o.dashboardUrl ?? d.dashboardUrl).replace(/\/+$/, ''),
    upgradeUrl: o.upgradeUrl ?? d.upgradeUrl,
    sessionUrl: o.sessionUrl ?? d.sessionUrl,
    csrfToken: o.csrfToken ?? d.csrfToken,
    accountKey: o.accountKey ?? d.accountKey,
    initialTab,
    tokenKey: o.tokenKey ?? d.tokenKey,
    theme,
    siteUrlTypes: o.siteUrlTypes ?? d.siteUrlTypes,
  }
}
