import { KofiButton } from './Kofi'

export function Footer({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`footer ${compact ? 'compact' : ''}`}>
      <KofiButton />
      <div>Not affiliated with Spotify or Apple · album covers belong to their owners</div>
      <div className="credit">
        Wall flag 3D model:{' '}
        <a href="https://sketchfab.com/3d-models/american-wall-flag-da80c481fae84ce98536ce97c75b14cf" target="_blank" rel="noreferrer">
          “American wall flag”
        </a>{' '}
        by{' '}
        <a href="https://sketchfab.com/exiS7-Gs" target="_blank" rel="noreferrer">
          exiS7-Gs
        </a>
        ,{' '}
        <a href="http://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
          CC BY 4.0
        </a>
      </div>
    </footer>
  )
}
