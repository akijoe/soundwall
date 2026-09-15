import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import * as THREE from 'three'
import type { Group, Mesh } from 'three'
import { makeDemoLibrary } from '../demo/demoAlbums'
import { RoomEnv } from './preview/RoomEnv'
import { SetupWizard } from './SetupWizard'
import { Logo } from './Logo'

interface Props {
  needsSetup: boolean
  error: string | null
  onLogin: () => void
  onDemo: () => void
  onSaveClientId: (id: string) => void
  /** Present when a collage is already loaded for a logged-in listener. */
  onResume?: () => void
}

const COVERS = makeDemoLibrary()
  .slice(0, 14)
  .map((a) => a.thumb)

/** A ring of album covers circling the chrome planet on an orbit track. */
function CoverRing({ urls, radius, tilt, speed, size, offset = 0 }: { urls: string[]; radius: number; tilt: [number, number, number]; speed: number; size: number; offset?: number }) {
  const textures = useLoader(THREE.TextureLoader, urls)
  useEffect(() => {
    for (const t of textures) {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
    }
  }, [textures])
  const ring = useRef<Group>(null)
  const cards = useRef<Mesh[]>([])
  const { camera } = useThree()
  useFrame((_, dt) => {
    if (ring.current) ring.current.rotation.z += dt * speed
    // covers stay face-on to the viewer as they travel round
    for (const m of cards.current) m?.lookAt(camera.position)
  })
  return (
    <group rotation={tilt}>
      <mesh>
        <torusGeometry args={[radius, 0.012, 12, 220]} />
        <meshStandardMaterial color="#e4ecf7" metalness={1} roughness={0.15} />
      </mesh>
      <group ref={ring} rotation={[0, 0, offset]}>
        {textures.map((tex, i) => {
          const a = (i / textures.length) * Math.PI * 2
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * radius, Math.sin(a) * radius, 0]}
              ref={(el) => {
                if (el) cards.current[i] = el
              }}
            >
              <planeGeometry args={[size, size]} />
              <meshStandardMaterial map={tex} roughness={0.55} metalness={0.05} side={THREE.DoubleSide} />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

/** Chrome planet with album covers in orbit, inside a faint wireframe globe. */
function Orbital() {
  const globe = useRef<Mesh>(null)
  const tiltGroup = useRef<Group>(null)
  useFrame(({ clock }, dt) => {
    if (globe.current) globe.current.rotation.y -= dt * 0.05
    if (tiltGroup.current) tiltGroup.current.rotation.y = Math.sin(clock.elapsedTime * 0.12) * 0.25
  })
  return (
    <group>
      <Float speed={1.2} rotationIntensity={0.3} floatIntensity={0.6}>
        <mesh>
          <sphereGeometry args={[1.05, 96, 96]} />
          <meshStandardMaterial color="#ffffff" metalness={1} roughness={0.08} />
        </mesh>
      </Float>
      <group ref={tiltGroup}>
        <CoverRing urls={COVERS.slice(0, 8)} radius={2.15} tilt={[Math.PI / 2 - 0.55, 0, 0]} speed={0.16} size={0.78} />
        <CoverRing urls={COVERS.slice(8, 14)} radius={3.15} tilt={[Math.PI / 2 - 0.35, 0.35, 0]} speed={-0.09} size={0.64} offset={0.4} />
      </group>
      <mesh ref={globe}>
        <sphereGeometry args={[3.7, 28, 18]} />
        <meshBasicMaterial color="#3de1ff" wireframe transparent opacity={0.08} />
      </mesh>
    </group>
  )
}

export function Hero({ needsSetup, error, onLogin, onDemo, onSaveClientId, onResume }: Props) {
  return (
    <section className="hero">
      <h1 className="hero-title">
        <Logo size="large" />
      </h1>
      <p className="hero-sub">The albums you play most — on a wall flag, a mug, a t-shirt.</p>

      <div className="hero-3d" aria-hidden>
        <Canvas camera={{ position: [0, 0.4, 7], fov: 40 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }}>
          <Suspense fallback={null}>
            <RoomEnv intensity={1} />
            <ambientLight intensity={0.25} />
            <directionalLight position={[3, 5, 4]} intensity={1.4} />
            <pointLight position={[-5, 2, 2]} color="#3de1ff" intensity={70} />
            <pointLight position={[5, -2, 2]} color="#8d7bff" intensity={60} />
            <Orbital />
          </Suspense>
        </Canvas>
      </div>

      <p className="hero-copy">
        Log in and your listening history becomes a collage: drag it into shape, hover to hear each album, then see it
        printed.
      </p>

      {needsSetup ? (
        <SetupWizard onSave={onSaveClientId} onDemo={onDemo} />
      ) : (
        <div className="hero-cta">
          {onResume ? (
            <button className="btn btn-green btn-lg" onClick={onResume}>
              Open your collage
            </button>
          ) : (
            <button className="btn btn-green btn-lg" onClick={onLogin}>
              Log in with Spotify
            </button>
          )}
          <button className="btn btn-lg" onClick={onDemo}>
            Try the demo
          </button>
        </div>
      )}

      {error && <div className="error-box">⚠ {error}</div>}

    </section>
  )
}
