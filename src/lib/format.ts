export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', {month: 'short', day: '2-digit', year: 'numeric'})
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong. Please try again.'
}

export const SUBTITLES = {
  upload: 'Add files for AI-powered accessibility remediation.',
  scan: 'Scan this website for PDFs and check their accessibility issues.',
  remediated: 'View, download, and manage completed remediated PDFs.',
} as const

export const PER_PAGE_OPTIONS = [10, 25, 50]

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
