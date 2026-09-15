import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { ProductId } from '../../types'
import { RoomEnv } from './RoomEnv'
import { PRODUCTS, drawDesign, puzzlePieces, type ProductSpec } from './products'
import { Flag, Keychain, Mousepad, Mug, PhoneCase, Pillow, Poster, Puzzle, Tee, Tote } from './Products'

interface Props {
  product: ProductId
  onProduct: (p: ProductId) => void
  collage: HTMLCanvasElement
  version: number
  bg: string
}

function makeTexture(canvas: HTMLCanvasElement, gl: THREE.WebGLRenderer) {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = gl.capabilities.getMaxAnisotropy()
  return t
}

const MODELS: Record<ProductId, (p: { texture: THREE.Texture; aspect: number }) => React.JSX.Element> = {
  flag: Flag,
  poster: Poster,
  tee: Tee,
  mug: Mug,
  pillow: Pillow,
  tote: Tote,
  case: PhoneCase,
  keychain: Keychain,
  mousepad: Mousepad,
  puzzle: Puzzle,
}

function Scene({ spec, collage, version, bg }: { spec: ProductSpec; collage: HTMLCanvasElement; version: number; bg: string }) {
  const gl = useThree((s) => s.gl)
  const design = useMemo(() => document.createElement('canvas'), [])
  const [aspect, setAspect] = useState(1)
  const [texture, setTexture] = useState<THREE.Texture>(() => makeTexture(design, gl))
  const size = useRef({ w: 0, h: 0 })

  useEffect(() => {
    setAspect(drawDesign(design, collage, spec, bg))
    if (design.width !== size.current.w || design.height !== size.current.h) {
      // three allocates immutable GPU storage per texture, so a canvas whose
      // dimensions changed needs a fresh texture rather than needsUpdate.
      size.current = { w: design.width, h: design.height }
      setTexture((old) => {
        old.dispose()
        return makeTexture(design, gl)
      })
    } else {
      texture.needsUpdate = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, collage, spec, version, bg, gl])

  useEffect(() => () => texture.dispose(), [texture])

  // Fresh viewpoint whenever the product changes.
  const controls = useRef<OrbitControlsImpl>(null)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    camera.position.set(...spec.camera)
    controls.current?.target.set(0, 0, 0)
    controls.current?.update()
  }, [spec, camera])

  const Model = MODELS[spec.id]
  return (
    <>
      <RoomEnv intensity={0.6} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={spec.wall ? [2, 4, 9] : [3, 6, 5]}
        intensity={1.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={1}
        shadow-camera-far={20}
      />
      <pointLight position={[-5, 2, -2]} color="#ff2fb3" intensity={35} />
      <pointLight position={[5, -1, -3]} color="#3cf0ff" intensity={35} />
      <Model texture={texture} aspect={aspect} />
      {!spec.wall && <ContactShadows position={[0, spec.flat ? -0.66 : -2.55, 0]} opacity={0.55} scale={12} blur={2.4} far={5} />}
      <OrbitControls
        ref={controls}
        enablePan={false}
        autoRotate={!spec.wall}
        autoRotateSpeed={spec.flat ? 0.8 : 1.2}
        minDistance={3.5}
        maxDistance={11}
        minPolarAngle={spec.flat ? 0.15 : 0.5}
        maxPolarAngle={spec.wall ? Math.PI / 2 + 0.2 : spec.flat ? Math.PI / 2 - 0.15 : Math.PI / 2 + 0.35}
        minAzimuthAngle={spec.wall ? -0.9 : -Infinity}
        maxAzimuthAngle={spec.wall ? 0.9 : Infinity}
      />
    </>
  )
}

export function ProductViewer({ product, onProduct, collage, version, bg }: Props) {
  const spec = PRODUCTS.find((p) => p.id === product)!
  // Posters are cut to the collage's shape, so their size label follows it.
  const collageAspect = collage.height ? collage.width / collage.height : 1
  const size =
    spec.id === 'poster'
      ? `${collageAspect >= 1 ? 24 : Math.round(24 * collageAspect)} × ${collageAspect >= 1 ? Math.round(24 / collageAspect) : 24} in`
      : spec.id === 'puzzle'
        ? `${puzzlePieces(collage).count} pieces`
        : spec.size
  return (
    <>
      <div className="preview-tabs" role="tablist">
        {PRODUCTS.map((p) => (
          <button key={p.id} role="tab" aria-selected={p.id === product} className={`chip ${p.id === product ? 'active' : ''}`} onClick={() => onProduct(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="preview-canvas">
        <Canvas shadows camera={{ position: spec.camera, fov: 36 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}>
          <Suspense fallback={null}>
            <Scene spec={spec} collage={collage} version={version} bg={bg} />
          </Suspense>
        </Canvas>
      </div>
      <div className="preview-caption">
        <span>
          {spec.label.charAt(0).toUpperCase() + spec.label.slice(1)}{' '}
          <span className="dim">
            · {size} · {spec.wall ? 'drag to look around' : 'drag to spin'}
          </span>
        </span>
        <span className="price">{spec.price}</span>
      </div>
    </>
  )
}
