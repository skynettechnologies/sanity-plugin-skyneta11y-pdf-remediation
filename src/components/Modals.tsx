import {useEffect, useRef} from 'react'
import type {ReactNode, RefObject, SyntheticEvent} from 'react'

import type {PdfAccountDraft, PdfAccountErrors, PdfPlan} from '../lib/types'
import {Icon} from './Icons'

/**
 * Closes a modal when the backdrop itself (not the dialog) is clicked.
 * Attached natively: the backdrop is a presentational element, and the dialog
 * is also closable from its buttons and the Escape key.
 */
function useBackdropClose(
  ref: RefObject<HTMLDivElement | null>,
  onClose: () => void,
  enabled = true,
) {
  useEffect(() => {
    const node = ref.current
    if (!node || !enabled) return undefined
    const onClick = (event: MouseEvent) => {
      if (event.target === node) onClose()
    }
    node.addEventListener('click', onClick)
    return () => node.removeEventListener('click', onClick)
  }, [ref, onClose, enabled])
}

/* ============================================================
   ACCOUNT DETAILS
   Opens only when an action first has to reach the service.
   ============================================================ */

interface AccountModalProps {
  prompt: string
  draft: PdfAccountDraft
  errors: PdfAccountErrors
  failure: string
  submitting: boolean
  onChange: (draft: PdfAccountDraft) => void
  onSubmit: () => void
  onClose: () => void
}

const ACCOUNT_FIELDS: {
  key: keyof PdfAccountDraft
  id: string
  label: string
  type: string
  placeholder: string
  autoComplete: string
  hint: string
}[] = [
  {
    key: 'name',
    id: 'aiopdfAccountName',
    label: 'Name',
    type: 'text',
    placeholder: 'Acme Corporation',
    autoComplete: 'organization',
    hint: 'Your name, or your organisation’s.',
  },
  {
    key: 'email',
    id: 'aiopdfAccountEmail',
    label: 'Email address',
    type: 'email',
    placeholder: 'you@example.com',
    autoComplete: 'email',
    hint: 'Identifies the account and its plan.',
  },
  {
    key: 'domain',
    id: 'aiopdfAccountDomain',
    label: 'Website domain',
    type: 'text',
    placeholder: 'example.com',
    autoComplete: 'url',
    hint: 'The site these PDFs belong to. Change it if this is not it.',
  },
]

export function AccountModal({
  prompt,
  draft,
  errors,
  failure,
  submitting,
  onChange,
  onSubmit,
  onClose,
}: AccountModalProps) {
  const firstInput = useRef<HTMLInputElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  useBackdropClose(backdrop, onClose, !submitting)

  useEffect(() => {
    firstInput.current?.focus()
  }, [])

  const handleSubmit = (event: SyntheticEvent) => {
    event.preventDefault()
    onSubmit()
  }

  const renderField = (field: (typeof ACCOUNT_FIELDS)[number], index: number) => {
    const error = errors[field.key]
    return (
      <div className="field" key={field.key}>
        <label htmlFor={field.id}>
          {field.label}
          <span className="req">*</span>
        </label>
        <input
          ref={index === 0 ? firstInput : undefined}
          id={field.id}
          className="input"
          type={field.type}
          placeholder={field.placeholder}
          autoComplete={field.autoComplete}
          value={draft[field.key]}
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${field.id}-error` : `${field.id}-hint`}
          onChange={(event) => onChange({...draft, [field.key]: event.target.value})}
        />
        {error ? (
          <div className="form-error" id={`${field.id}-error`}>
            {error}
          </div>
        ) : (
          <div className="aiopdf-field-hint" id={`${field.id}-hint`}>
            {field.hint}
          </div>
        )}
      </div>
    )
  }

  const [nameField, emailField, domainField] = ACCOUNT_FIELDS

  return (
    <div ref={backdrop} className="modal-backdrop">
      <div
        className="modal aiopdf-account-modal"
        // Native <dialog> brings UA positioning and display rules that fight the
        // module stylesheet, so the ARIA role is kept on a styled div.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="dialog"
        aria-modal="true"
        aria-labelledby="aiopdfAccountTitle"
      >
        <div className="sug-head" style={{marginBottom: 18}}>
          <div>
            <h3 id="aiopdfAccountTitle" style={{marginBottom: 4}}>
              First, a few details
            </h3>
            <div className="sug-sub">{prompt}</div>
          </div>
          <button
            type="button"
            className="icon-btn close-btn-model"
            aria-label="Close"
            disabled={submitting}
            onClick={onClose}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit}>
          <div className="form-row">
            {nameField && renderField(nameField, 0)}
            {emailField && renderField(emailField, 1)}
          </div>
          {domainField && renderField(domainField, 2)}

          {failure && (
            <div className="rule-callout error" style={{margin: '4px 0 20px'}}>
              <span className="icon">
                <Icon name="warning" size={20} />
              </span>
              <div>
                <strong>That did not work</strong>
                <p>{failure}</p>
              </div>
            </div>
          )}

          <div className="modal-actions" style={{marginTop: 8, justifyContent: 'flex-end'}}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={submitting}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-gradient btn-sm" disabled={submitting}>
              {submitting ? (
                <>
                  <Icon name="spinner" size={17} /> Setting up…
                </>
              ) : (
                <>
                  <Icon name="sparkles" size={17} /> Save and continue
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ============================================================
   REMOVE CONFIRMATION
   ============================================================ */

export interface ConfirmOptions {
  title: string
  message: string
  itemName?: string
  confirmText?: string
  onConfirm: () => void
}

export function ConfirmModal({options, onClose}: {options: ConfirmOptions; onClose: () => void}) {
  return (
    <div className="modal-overlay">
      <div
        className="confirmation-modal"
        // Native <dialog> brings UA positioning and display rules that fight the
        // module stylesheet, so the ARIA role is kept on a styled div.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="dialog"
        aria-modal="true"
        aria-labelledby="aiopdfConfirmTitle"
      >
        <div className="modal-header">
          <h2 id="aiopdfConfirmTitle">{options.title}</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p>
            {options.message}
            {options.itemName && (
              <>
                {' '}
                <strong>{options.itemName}</strong>
              </>
            )}
          </p>
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn-delete"
            onClick={() => {
              onClose()
              options.onConfirm()
            }}
          >
            {options.confirmText || 'Remove'}
          </button>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   PLAN COVERAGE
   PARTIAL_REQUIRED → can continue with covered pages.
   PAGE_LIMIT       → nothing left, upgrade only.
   ============================================================ */

export interface CoverageState {
  covered: number
  total: number
  message: string
  isFree: boolean
}

export function CoverageModal({
  state,
  plan,
  accepted,
  onAcceptChange,
  onUpgrade,
  onContinue,
  onClose,
}: {
  state: CoverageState
  plan: PdfPlan | null
  accepted: boolean
  onAcceptChange: (value: boolean) => void
  onUpgrade: () => void
  onContinue: () => void
  onClose: () => void
}) {
  const {covered, total, message, isFree} = state
  const backdrop = useRef<HTMLDivElement>(null)
  useBackdropClose(backdrop, onClose)
  const canContinue = covered > 0

  const title: ReactNode = canContinue
    ? isFree
      ? `Free trial covers the first ${covered} pages`
      : `Your current plan covers ${covered} of ${total} pages`
    : message || "You've used all pages included in your current plan."

  const body = canContinue
    ? `Your PDF${total === covered ? '' : 's'} contain ${total} pages. Upgrade to process all pages, or continue with the ${covered} pages included in your current plan.`
    : `The documents you selected contain ${total.toLocaleString()} pages, and your ${
        isFree ? 'free trial' : 'plan'
      } has no pages left. Upgrade to carry on remediating.`

  return (
    <div ref={backdrop} className="modal-backdrop">
      <div
        className="modal"
        style={{width: 540}}
        // Native <dialog> brings UA positioning and display rules that fight the
        // module stylesheet, so the ARIA role is kept on a styled div.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="dialog"
        aria-modal="true"
        aria-labelledby="aiopdfPartialHeading"
      >
        <div style={{display: 'flex', gap: 14, alignItems: 'flex-start'}}>
          <span className="notice-icon" style={{width: 48, height: 48, flexShrink: 0}}>
            <Icon name={canContinue ? 'info' : 'warning'} size={24} />
          </span>
          <div>
            <h3 id="aiopdfPartialHeading" style={{marginBottom: 8}}>
              {title}
            </h3>
            <p
              style={{
                margin: 0,
                color: 'var(--text-soft)',
                fontSize: 15,
                lineHeight: 1.6,
                fontWeight: 600,
              }}
            >
              {body}
            </p>
          </div>
        </div>

        {plan && (
          <div className="notice-pill" style={{marginTop: 16, marginBottom: 0, width: '100%'}}>
            <Icon name="crown" size={18} />
            <span>
              Recommended: <b>{plan.name}</b>
              <span style={{color: 'var(--text-muted)'}}>
                {' '}
                — {plan.pages.toLocaleString()} pages · ${plan.price.toLocaleString()}
              </span>
            </span>
          </div>
        )}

        {canContinue && (
          <label className="checkbox-row" style={{margin: '16px 0 0', cursor: 'pointer'}}>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => onAcceptChange(event.target.checked)}
            />
            <span>
              Continue with my {isFree ? 'free plan' : 'current plan'} ({covered} pages)
            </span>
          </label>
        )}

        <div className="modal-actions" style={{marginTop: 22, justifyContent: 'space-between'}}>
          {!canContinue && (
            <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
              Cancel
            </button>
          )}
          <button type="button" className="btn btn-gradient btn-sm" onClick={onUpgrade}>
            <Icon name="crown" size={17} />{' '}
            <span>{canContinue ? 'Recommended Plan' : 'Upgrade Plan'}</span>
          </button>
          {canContinue && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!accepted}
              onClick={onContinue}
            >
              <Icon name="sparkles" size={17} /> Start AI Remediation
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
