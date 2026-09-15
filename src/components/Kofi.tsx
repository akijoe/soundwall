import { useSyncExternalStore } from 'react'
import { Win } from './Win'

export const KOFI_URL = 'https://ko-fi.com/J7F62709NO'

/** The Ko-fi widget is just a styled link, rendered here without document.write. */
export function KofiButton({ label = 'Buy me a coffee' }: { label?: string }) {
  return (
    <a className="kofi" href={KOFI_URL} target="_blank" rel="noreferrer" title="Support me on ko-fi.com">
      <img src="https://storage.ko-fi.com/cdn/cup-border.png" alt="" />
      {label}
    </a>
  )
}

// Tiny external store so any component (e.g. the export button) can open the modal.
let open = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
export const kofiModal = {
  show() {
    open = true
    emit()
  },
  hide() {
    open = false
    emit()
  },
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  get: () => open,
}

export function KofiModal() {
  const isOpen = useSyncExternalStore(kofiModal.subscribe, kofiModal.get)
  if (!isOpen) return null
  return (
    <div className="modal-backdrop" onClick={kofiModal.hide} role="presentation">
      <Win title="" className="modal" bodyStyle={{ padding: 0 }} style={{ padding: '26px 28px 24px' }}>
        <div onClick={(e) => e.stopPropagation()}>
          <h2>Your print file is ready</h2>
          <p>
            SOUNDWALL is free and runs entirely in your browser. If it made you smile, a coffee keeps the lights on.
          </p>
          <div className="row">
            <KofiButton />
            <button className="btn" onClick={kofiModal.hide}>
              Maybe later
            </button>
          </div>
        </div>
      </Win>
    </div>
  )
}
