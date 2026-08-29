import { useEffect, useRef } from 'react'

// Owner UX Follow-up (GAP-017 §6): the first confirm/cancel modal pattern
// in this app -- no destructive action (Approve, Return-to-stage) had one
// before. A native <dialog> (showModal()/close()), no library, so future
// destructive actions can reuse this instead of inventing another pattern.
// The parent only ever mounts this component while a confirmation is
// pending, so showModal() on mount / close() on unmount is the whole
// lifecycle -- no separate `open` prop needed.
type Props = {
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ title, body, confirmLabel, cancelLabel = 'Anuluj', onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    // The native ESC-to-dismiss path fires 'cancel', not a click on our own
    // Cancel button -- both must lead to the same onCancel.
    const handleCancel = (event: Event) => { event.preventDefault(); onCancel() }
    dialog.addEventListener('cancel', handleCancel)
    return () => { dialog.removeEventListener('cancel', handleCancel); dialog.close() }
  }, [onCancel])

  return <dialog ref={ref} className="confirm-dialog">
    <h3>{title}</h3>
    <p className="confirm-dialog-body">{body}</p>
    <div className="confirm-dialog-actions">
      <button type="button" onClick={onCancel}>{cancelLabel}</button>
      <button type="button" className="danger" onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </dialog>
}
