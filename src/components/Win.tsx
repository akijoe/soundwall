import type { CSSProperties, ReactNode } from 'react'

interface Props {
  title: string
  icon?: string
  children: ReactNode
  className?: string
  style?: CSSProperties
  right?: ReactNode
  bodyStyle?: CSSProperties
}

/** Glass panel — the site's main container. */
export function Win({ title, children, className, style, right, bodyStyle }: Props) {
  return (
    <section className={`win ${className ?? ''}`} style={style}>
      {(title || right) && (
        <header className="win-title">
          <span className="t">{title}</span>
          {right}
        </header>
      )}
      <div className="win-body" style={bodyStyle}>
        {children}
      </div>
    </section>
  )
}
