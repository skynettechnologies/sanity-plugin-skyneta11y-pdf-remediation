import {useEffect, useState} from 'react'
import {useClient, useWorkspace} from 'sanity'
import type {SanityClient} from 'sanity'

import {normaliseDomain} from './account'

/**
 * Discovers the front-end domain the PDFs most likely belong to, entirely at
 * runtime. Adapted from the Video Subtitle plugin's site-URL resolution.
 *
 * The result is only a HINT: it pre-fills the domain field of the account
 * dialog, where the editor can correct it. It is never registered on its own.
 *
 * Sources, best first:
 *   1. A URL field on a published settings-like document
 *   2. The project's CORS origins (needs Administrator/Developer role)
 *   3. `externalStudioHost` in the project metadata
 *
 * The Studio's own hostname is deliberately NOT used: in the HTML build the
 * page hostname was the fallback, but inside the Studio that is usually
 * `*.sanity.studio` or `localhost`, which is never the site.
 */

/** Projects API version — see https://www.sanity.io/docs/projects-api */
const MANAGEMENT_API_VERSION = '2021-06-07'

/** Content Lake API version for document lookups. */
const CONTENT_API_VERSION = '2024-10-01'

/** Conventional settings type names, tried before the type-agnostic sweep. */
export const DEFAULT_SITE_URL_TYPES = [
  'siteSettings',
  'settings',
  'generalSettings',
  'seoSettings',
  'site',
  'homePage',
  'home',
  'config',
]

/** Pass 1: settings types — a bare `url` is trusted because the type is a signal. */
const TYPED_SITE_URL_QUERY = /* groq */ `
  *[
    _type in $types
    && !(_id in path("drafts.**"))
    && defined(coalesce(siteUrl, url, websiteUrl, website, domain, canonicalUrl, baseUrl))
  ][0]{
    "url": coalesce(siteUrl, url, websiteUrl, website, domain, canonicalUrl, baseUrl)
  }.url
`

/** Pass 2: any published document, only on names that clearly mean "this site". */
const ANY_DOC_SITE_URL_QUERY = /* groq */ `
  *[
    !(_id in path("drafts.**"))
    && defined(coalesce(siteUrl, websiteUrl, baseUrl, canonicalUrl, homepageUrl))
  ][0]{
    "url": coalesce(siteUrl, websiteUrl, baseUrl, canonicalUrl, homepageUrl)
  }.url
`

const LOCAL_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /\.local$/i,
  /\.localhost$/i,
]

const STUDIO_HOST_PATTERNS = [/\.sanity\.studio$/i, /\.sanity\.build$/i]

/** Preview hosts are allowed, but ranked below a custom domain. */
const PREVIEW_HOST_PATTERNS = [
  /\.vercel\.app$/i,
  /\.netlify\.app$/i,
  /\.pages\.dev$/i,
  /\.onrender\.com$/i,
  /\.web\.app$/i,
  /\.firebaseapp\.com$/i,
  /\.github\.io$/i,
]

export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
}

export function isStudioHostname(hostname: string): boolean {
  return STUDIO_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
}

function isPreviewHostname(hostname: string): boolean {
  return PREVIEW_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
}

/** Rejects slugs, sentences, mailto: and other non-domains. */
function looksLikeDomain(hostname: string): boolean {
  if (!hostname || hostname.length > 253 || /\s/.test(hostname)) return false
  return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(hostname)
}

/** Normalises, validates and de-duplicates raw URL-ish values. */
function toHostnames(values: unknown[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const hostname = normaliseDomain(value)
    if (!looksLikeDomain(hostname)) continue
    if (isStudioHostname(hostname) || isLocalHostname(hostname)) continue
    if (seen.has(hostname)) continue
    seen.add(hostname)
    out.push(hostname)
  }
  return out
}

function managementClient(client: SanityClient): SanityClient {
  return client.withConfig({
    apiVersion: MANAGEMENT_API_VERSION,
    // The Projects API lives on the global host (api.sanity.io), not the
    // project subdomain. The client has no non-deprecated way to say so; this
    // is the same switch the Studio itself uses for project-level requests.
    // oxlint-disable-next-line typescript/no-deprecated
    useProjectHostname: false,
    useCdn: false,
  })
}

/** Reads the front-end domain from a document in the dataset. Never throws. */
export async function fetchWebsiteFromDocuments(
  client: SanityClient,
  types: string[] = DEFAULT_SITE_URL_TYPES,
): Promise<string> {
  const contentClient = client.withConfig({apiVersion: CONTENT_API_VERSION})

  try {
    const typed = await contentClient.fetch<unknown>(TYPED_SITE_URL_QUERY, {types})
    const [fromTyped] = toHostnames([typed])
    if (fromTyped) return fromTyped
  } catch {
    /* no such types, or no read access — try the wider sweep */
  }

  try {
    const anyDoc = await contentClient.fetch<unknown>(ANY_DOC_SITE_URL_QUERY)
    const [fromAny] = toHostnames([anyDoc])
    if (fromAny) return fromAny
  } catch {
    /* nothing to find */
  }

  return ''
}

interface CorsEntry {
  origin?: string
}

/** Ranks a CORS origin as a site-domain candidate. Returns -1 to reject. */
function scoreOrigin(origin: string, studioHostname: string): number {
  if (!origin || origin.includes('*')) return -1
  if (!/^https?:\/\//i.test(origin)) return -1

  const hostname = normaliseDomain(origin)
  if (!looksLikeDomain(hostname)) return -1
  if (isLocalHostname(hostname) || isStudioHostname(hostname)) return -1
  if (hostname === studioHostname) return -1

  let score = origin.toLowerCase().startsWith('https://') ? 10 : 4
  if (isPreviewHostname(hostname)) score -= 5
  const labels = hostname.split('.').length
  score += labels <= 2 ? 2 : labels === 3 ? 1 : 0
  return score
}

/** Reads and ranks the project's CORS origins. Never throws. */
export async function fetchCorsCandidates(
  client: SanityClient,
  projectId: string,
  studioHostname: string,
): Promise<string[]> {
  try {
    const entries = await managementClient(client).request<CorsEntry[]>({
      url: `/projects/${projectId}/cors`,
      method: 'GET',
    })
    if (!Array.isArray(entries)) return []
    const ranked = entries
      .map((entry) => ({
        origin: entry?.origin ?? '',
        score: scoreOrigin(entry?.origin ?? '', studioHostname),
      }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score)
    return toHostnames(ranked.map((item) => item.origin))
  } catch {
    // Expected for editors: project settings need Administrator or Developer.
    return []
  }
}

interface ProjectResponse {
  externalStudioHost?: string
  metadata?: {externalStudioHost?: string}
}

/** Reads `externalStudioHost` from the project. Never throws. */
export async function fetchProjectSiteHints(
  client: SanityClient,
  projectId: string,
): Promise<string[]> {
  try {
    const project = await managementClient(client).request<ProjectResponse>({
      url: `/projects/${projectId}`,
      method: 'GET',
    })
    return toHostnames([project?.externalStudioHost, project?.metadata?.externalStudioHost])
  } catch {
    return []
  }
}

/**
 * Best-guess front-end domain, or '' while resolving / when nothing is found.
 * When `explicit` is given, discovery is skipped entirely.
 */
export function useSiteUrlHint(
  explicit: string | undefined,
  types: string[] = DEFAULT_SITE_URL_TYPES,
): string {
  const client = useClient({apiVersion: CONTENT_API_VERSION})
  const {projectId} = useWorkspace()
  const pinned = explicit ? normaliseDomain(explicit) : ''
  const [discovered, setDiscovered] = useState('')

  // Callers pass array literals, so key on contents rather than identity.
  const typesKey = types.join(',')

  useEffect(() => {
    if (pinned) return undefined

    let cancelled = false
    const studioHostname = typeof window === 'undefined' ? '' : window.location.hostname

    const resolve = async () => {
      const [documentUrl, corsHosts, metadataHosts] = await Promise.all([
        fetchWebsiteFromDocuments(client, typesKey.split(',')),
        fetchCorsCandidates(client, projectId, studioHostname),
        fetchProjectSiteHints(client, projectId),
      ])
      if (cancelled) return
      const best = [documentUrl, ...corsHosts, ...metadataHosts].find(Boolean)
      setDiscovered(best ?? '')
    }

    void resolve()
    return () => {
      cancelled = true
    }
  }, [client, pinned, projectId, typesKey])

  return pinned || discovered
}
