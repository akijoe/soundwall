import { useState } from 'react'
import { redirectUri } from '../spotify/auth'
import { Win } from './Win'
import { useToast } from './Toast'

interface Props {
  onSave: (id: string) => void
  onDemo: () => void
}

export function SetupWizard({ onSave, onDemo }: Props) {
  const [id, setId] = useState('')
  const toast = useToast()
  const uri = redirectUri()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(uri)
      toast('Redirect URI copied ✓', 'ok')
    } catch {
      toast('Could not copy — select it manually', 'err')
    }
  }
  return (
    <Win title="One-time setup" className="wizard" style={{ textAlign: 'left' }}>
      <p className="small" style={{ marginTop: 0 }}>
        One-time setup: this site talks to Spotify directly from your browser, so it needs a (free) Spotify app of your
        own.
      </p>
      <ol>
        <li>
          Open{' '}
          <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
            developer.spotify.com/dashboard
          </a>{' '}
          and hit <b>Create app</b>. Name and description can be anything.
        </li>
        <li>
          Under <b>Redirect URIs</b> add exactly:{' '}
          <span className="code">
            {uri}
            <button className="btn btn-sm" onClick={copy} type="button">
              Copy
            </button>
          </span>
        </li>
        <li>
          Tick <b>Web API</b>, save, then copy the app's <b>Client ID</b> from its settings page and paste it below.
        </li>
      </ol>
      <div className="row">
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="paste client id…"
          value={id}
          onChange={(e) => setId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && id.trim() && onSave(id)}
          spellCheck={false}
        />
        <button className="btn btn-green" disabled={id.trim().length < 20} onClick={() => onSave(id)}>
          Save & log in
        </button>
        <button className="btn" onClick={onDemo}>
          Skip to the demo
        </button>
      </div>
      <p className="small" style={{ marginBottom: 0 }}>
        Stored only in this browser's localStorage. Apps start in Development Mode, which is fine for your own account
        (other listeners would need to be added under User Management).
      </p>
    </Win>
  )
}
