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
        {' · '}Phone case model:{' '}
        <a href="https://sketchfab.com/3d-models/iphone-17-pro-phone-case-4883a95f86ea4835880ea8c7bcf614ba" target="_blank" rel="noreferrer">
          “iPhone 17 Pro Phone Case”
        </a>{' '}
        by{' '}
        <a href="https://sketchfab.com/Henrybenrydude657" target="_blank" rel="noreferrer">
          Henrybenrydude657
        </a>
      </div>
    </footer>
  )
}
