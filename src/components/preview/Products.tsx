import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

interface ProductProps {
  texture: THREE.Texture
  /** Aspect (w/h) of the design texture. */
  aspect: number
}

/* ---------------- helpers ---------------- */

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

/** ShapeGeometry UVs are raw positions; stretch them to 0..1 so a texture fits the shape. */
function normalizeUVs(geo: THREE.BufferGeometry) {
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  const pos = geo.attributes.position
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y))
  }
  uv.needsUpdate = true
  return geo
}

function extruded(shape: THREE.Shape, depth: number, bevel = 0.02) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 24 })
  g.translate(0, 0, -depth / 2)
  return g
}

function puffedPlane(W: number, H: number, puff: number, segs = 48) {
  const geo = new THREE.PlaneGeometry(W, H, segs, segs)
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (W / 2)
    const y = pos.getY(i) / (H / 2)
    const dome = Math.sqrt(Math.max(0, Math.cos((x * Math.PI) / 2) * Math.cos((y * Math.PI) / 2)))
    const dimple = 1 - 0.18 * Math.exp(-(x * x + y * y) * 4)
    pos.setZ(i, puff * dome * dimple)
  }
  geo.computeVertexNormals()
  return geo
}

const Wall = ({ color = '#2a1a5a' }: { color?: string }) => (
  <mesh position={[0, 0, -0.16]} receiveShadow>
    <planeGeometry args={[40, 24]} />
    <meshStandardMaterial color={color} roughness={1} />
  </mesh>
)

/* ---------------- WALL FLAG (static folded cloth from a GLTF scan) ---------------- */
const MODEL_BASE = `${import.meta.env.BASE_URL}models/`

/** First mesh of a GLTF scene; optionally flattened into world space. */
function firstMesh(scene: THREE.Object3D, applyWorld = true): { geometry: THREE.BufferGeometry; material: THREE.Material | null } {
  let found: THREE.Mesh | null = null
  scene.updateMatrixWorld(true)
  scene.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh
  })
  if (!found) throw new Error('model has no mesh')
  const m = found as THREE.Mesh
  const geometry = m.geometry.clone()
  if (applyWorld) geometry.applyMatrix4(m.matrixWorld)
  return { geometry, material: Array.isArray(m.material) ? m.material[0] : m.material }
}

export function Flag({ texture }: ProductProps) {
  const gltf = useGLTF(`${MODEL_BASE}flag/scene.gltf`)
  const { geometry, normalMap } = useMemo(() => {
    const { geometry: geo, material } = firstMesh(gltf.scene)
    // The scan's flag occupies a 5:3 band of its texture; stretch that band to 0..1.
    const uv = geo.attributes.uv as THREE.BufferAttribute
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (let i = 0; i < uv.count; i++) {
      u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i))
      v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i))
    }
    // (the band's u axis runs right-to-left relative to the hanging cloth)
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - (uv.getX(i) - u0) / (u1 - u0), (uv.getY(i) - v0) / (v1 - v0))
    uv.needsUpdate = true
    // Orient the cloth so its thin axis is depth and its long edge is horizontal.
    geo.computeBoundingBox()
    let size = new THREE.Vector3()
    geo.boundingBox!.getSize(size)
    const thin = size.x < size.y && size.x < size.z ? 'x' : size.y < size.z ? 'y' : 'z'
    if (thin === 'y') geo.rotateX(-Math.PI / 2)
    else if (thin === 'x') geo.rotateY(Math.PI / 2)
    geo.computeBoundingBox()
    geo.boundingBox!.getSize(size)
    if (size.y > size.x) geo.rotateZ(Math.PI / 2)
    geo.computeBoundingBox()
    const bb = geo.boundingBox!
    size = new THREE.Vector3()
    bb.getSize(size)
    const center = new THREE.Vector3()
    bb.getCenter(center)
    geo.translate(-center.x, -center.y, -bb.min.z)
    const k = 3.9 / size.x
    geo.scale(k, k, k)
    geo.computeVertexNormals()
    const nm = (material as THREE.MeshStandardMaterial | null)?.normalMap ?? null
    return { geometry: geo, normalMap: nm }
  }, [gltf])

  const hooks: [number, number][] = useMemo(() => {
    geometry.computeBoundingBox()
    const bb = geometry.boundingBox!
    return [
      [bb.min.x + 0.12, bb.max.y - 0.1],
      [bb.max.x - 0.12, bb.max.y - 0.1],
    ]
  }, [geometry])
  const chrome = <meshStandardMaterial color="#e9edf3" metalness={1} roughness={0.2} />
  return (
    <group position={[0, 0.2, 0]}>
      <Wall />
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial map={texture} normalMap={normalMap ?? undefined} normalScale={new THREE.Vector2(0.9, 0.9)} roughness={1} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      {hooks.map(([x, y], i) => (
        <group key={i} position={[x, y, 0.02]}>
          <mesh position={[0, 0, -0.08]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.2, 16]} />
            {chrome}
          </mesh>
          <mesh position={[0, 0, 0.04]}>
            <sphereGeometry args={[0.035, 16, 16]} />
            {chrome}
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ---------------- POSTER ---------------- */
export function Poster({ texture, aspect }: ProductProps) {
  const H = 3.2
  const W = H * aspect
  const f = 0.09
  const frameMat = <meshStandardMaterial color="#111118" roughness={0.3} metalness={0.4} />
  return (
    <group position={[0, 0.1, 0]}>
      <Wall />
      <mesh position={[0, 0, 0.02]} castShadow>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={texture} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[W, H]} />
        <meshPhysicalMaterial transparent opacity={0.08} roughness={0.05} metalness={0.2} color="#ffffff" />
      </mesh>
      {(
        [
          [0, H / 2 + f / 2, W + f * 2, f],
          [0, -H / 2 - f / 2, W + f * 2, f],
          [-W / 2 - f / 2, 0, f, H],
          [W / 2 + f / 2, 0, f, H],
        ] as [number, number, number, number][]
      ).map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, 0]} castShadow>
          <boxGeometry args={[w, h, 0.12]} />
          {frameMat}
        </mesh>
      ))}
    </group>
  )
}

/* ---------------- T-SHIRT ---------------- */
export function Tee({ texture, aspect }: ProductProps) {
  const geo = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(-0.95, 1.65)
    s.quadraticCurveTo(0, 1.25, 0.95, 1.65)
    s.lineTo(1.95, 1.35)
    s.lineTo(2.45, 0.45)
    s.lineTo(1.55, 0.08)
    s.lineTo(1.45, -1.95)
    s.quadraticCurveTo(0, -2.05, -1.45, -1.95)
    s.lineTo(-1.55, 0.08)
    s.lineTo(-2.45, 0.45)
    s.lineTo(-1.95, 1.35)
    s.closePath()
    return extruded(s, 0.1, 0.03)
  }, [])
  // print area: up to 2.4 wide (between the sleeves) × 2.0 tall
  const k = Math.min(2.4 / Math.max(aspect, 1e-3), 2.0)
  const ph = Math.min(k, 2.0)
  const pw = ph * aspect
  return (
    <group position={[0, 0.15, 0]}>
      <mesh geometry={geo} castShadow>
        <meshStandardMaterial color="#f7f7f5" roughness={0.95} />
      </mesh>
      {/* collar rib */}
      <mesh position={[0, 1.66, 0.085]} rotation={[0, 0, Math.PI]} scale={[1, 0.26, 1]}>
        <torusGeometry args={[0.95, 0.05, 8, 48, Math.PI]} />
        <meshStandardMaterial color="#e6e6e2" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.05, 0.095]}>
        <planeGeometry args={[pw, ph]} />
        <meshStandardMaterial map={texture} roughness={0.9} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    </group>
  )
}

/* ---------------- MUG ---------------- */
export function Mug({ texture, aspect }: ProductProps) {
  const R = 1
  const TOP = 1.15
  const BOT = -1.15
  const R_BOT = R * 0.93
  const printH = 1.95
  const printY = 0.05
  const bodyR = (y: number) => R_BOT + (R - R_BOT) * ((y - BOT) / (TOP - BOT))
  const pTop = bodyR(printY + printH / 2) + 0.004
  const pBot = bodyR(printY - printH / 2) + 0.004
  // The handle sits at +x (θ = 90°); the print is centred on the opposite side
  // and may run right up to the handle, leaving a small padding either side.
  const HANDLE_CLEAR = 0.32
  const arc = THREE.MathUtils.clamp((aspect * printH) / R, 0.7, Math.PI * 2 - 2 * HANDLE_CLEAR)
  const printCenter = -Math.PI / 2
  return (
    <group position={[0, -0.2, 0]} rotation={[0, Math.PI / 2 - 0.6, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[R, R_BOT, TOP - BOT, 96, 1, true]} />
        <meshStandardMaterial color="#ffffff" roughness={0.28} metalness={0.05} side={THREE.FrontSide} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[R * 0.93, R * 0.86, 2.26, 96, 1, true]} />
        <meshStandardMaterial color="#efeef2" roughness={0.35} side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, -1.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R * 0.93, 96]} />
        <meshStandardMaterial color="#e7e6ea" roughness={0.4} />
      </mesh>
      <mesh position={[0, BOT, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R_BOT, 96]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
      </mesh>
      <mesh position={[0, TOP, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[R * 0.93, R, 96]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, printY, 0]}>
        <cylinderGeometry args={[pTop, pBot, printH, 96, 1, true, printCenter - arc / 2, arc]} />
        <meshStandardMaterial map={texture} roughness={0.32} metalness={0.02} side={THREE.FrontSide} />
      </mesh>
      {/* arc runs slightly past a half-circle so both ends sink into the body */}
      <mesh position={[R * 0.9, 0.02, 0]} rotation={[0, 0, -Math.PI / 2 - Math.PI * 0.14]} castShadow>
        <torusGeometry args={[0.6, 0.12, 24, 72, Math.PI * 1.28]} />
        <meshStandardMaterial color="#ffffff" roughness={0.28} metalness={0.05} />
      </mesh>
    </group>
  )
}

/* ---------------- PILLOW ---------------- */
export function Pillow({ texture, aspect }: ProductProps) {
  const H = 3
  const W = H * aspect
  const front = useMemo(() => puffedPlane(W, H, 0.55), [W, H])
  const back = useMemo(() => puffedPlane(W, H, 0.55), [W, H])
  return (
    <group>
      <mesh geometry={front} castShadow>
        <meshStandardMaterial map={texture} roughness={0.95} />
      </mesh>
      <mesh geometry={back} rotation={[0, Math.PI, 0]}>
        <meshStandardMaterial color="#f4f1f8" roughness={0.95} />
      </mesh>
    </group>
  )
}

/* ---------------- TOTE BAG ---------------- */
export function Tote({ texture }: ProductProps) {
  const W = 2.8
  const H = 3.0
  const front = useMemo(() => puffedPlane(W, H, 0.3), [])
  const back = useMemo(() => puffedPlane(W, H, 0.3), [])
  const canvas = '#efe6d6'
  return (
    <group position={[0, -0.55, 0]}>
      <mesh geometry={front} castShadow>
        <meshStandardMaterial map={texture} roughness={1} />
      </mesh>
      <mesh geometry={back} rotation={[0, Math.PI, 0]}>
        <meshStandardMaterial color={canvas} roughness={1} />
      </mesh>
      {/* thin gusset so the edges read as fabric, not a box */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[W - 0.04, H - 0.04, 0.12]} />
        <meshStandardMaterial color="#e6dcc9" roughness={1} />
      </mesh>
      {[0.09, -0.09].map((z, i) => (
        <group key={i}>
          <mesh position={[0, H / 2 - 0.02, z]} scale={[1, 1.15, 1]} castShadow>
            <torusGeometry args={[0.8, 0.05, 12, 64, Math.PI]} />
            <meshStandardMaterial color={canvas} roughness={1} />
          </mesh>
          {/* strap ends sewn down the face */}
          {[-0.8, 0.8].map((x) => (
            <mesh key={x} position={[x, H / 2 - 0.3, z + Math.sign(z) * 0.03]}>
              <boxGeometry args={[0.1, 0.62, 0.03]} />
              <meshStandardMaterial color="#e2d7c3" roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

/* ---------------- PHONE CASE (iPhone 17 Pro, GLTF shell) ---------------- */
export function PhoneCase({ texture }: ProductProps) {
  const gltf = useGLTF(`${MODEL_BASE}case/case.gltf`)
  const { geometry } = useMemo(() => {
    // raw geometry: the scan's node transform only tilts it
    let geo = firstMesh(gltf.scene, false).geometry
    geo.computeBoundingBox()
    const bb = geo.boundingBox!
    const sz = new THREE.Vector3()
    bb.getSize(sz)
    const c = new THREE.Vector3()
    bb.getCenter(c)
    geo.translate(-c.x, -c.y, -c.z)
    const k = 2.95 / sz.y // the shell is modelled in millimetres
    geo.scale(k, k, k)
    geo.computeBoundingBox()
    const b = geo.boundingBox!
    // The shell has no UVs: project the print flat onto it (back face and a
    // wrap around the sides), and split faces so only the outside is printed.
    geo = geo.toNonIndexed()
    const pos = geo.attributes.position as THREE.BufferAttribute
    const uv = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) - b.min.x) / (b.max.x - b.min.x)
      uv[i * 2 + 1] = (pos.getY(i) - b.min.y) / (b.max.y - b.min.y)
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.computeVertexNormals()
    // the closed back plate faces +z; only its outer face gets the print
    const n = geo.attributes.normal as THREE.BufferAttribute
    const printTris: number[] = []
    const plainTris: number[] = []
    for (let t = 0; t < pos.count / 3; t++) {
      const nz = (n.getZ(t * 3) + n.getZ(t * 3 + 1) + n.getZ(t * 3 + 2)) / 3
      const z = (pos.getZ(t * 3) + pos.getZ(t * 3 + 1) + pos.getZ(t * 3 + 2)) / 3
      ;(nz > 0.35 && z > b.max.z - 0.12 ? printTris : plainTris).push(t)
    }
    const order = [...printTris, ...plainTris]
    const index = new Uint32Array(order.length * 3)
    order.forEach((t, i) => {
      index[i * 3] = t * 3
      index[i * 3 + 1] = t * 3 + 1
      index[i * 3 + 2] = t * 3 + 2
    })
    geo.setIndex(new THREE.BufferAttribute(index, 1))
    geo.clearGroups()
    geo.addGroup(0, printTris.length * 3, 0)
    geo.addGroup(printTris.length * 3, plainTris.length * 3, 1)
    return { geometry: geo }
  }, [gltf])

  return (
    // the back of the case (+z) faces the camera
    <group rotation={[0, -0.3, 0]} scale={[1.05, 1.05, 1.05]}>
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial attach="material-0" map={texture} roughness={0.4} metalness={0.05} />
        <meshStandardMaterial attach="material-1" color="#15191f" roughness={0.5} metalness={0.15} />
      </mesh>
    </group>
  )
}

/* ---------------- KEYCHAIN ---------------- */
export function Keychain({ texture, aspect }: ProductProps) {
  const S = 1.7
  const W = aspect >= 1 ? S : S * aspect
  const H = aspect >= 1 ? S / aspect : S
  const hole = new THREE.Vector2(-W / 2 + 0.2, H / 2 - 0.2)
  const tag = useMemo(() => {
    const shape = roundedRect(W, H, 0.18)
    const h = new THREE.Path()
    h.absarc(hole.x, hole.y, 0.09, 0, Math.PI * 2, true)
    shape.holes.push(h)
    return extruded(shape, 0.1, 0.015)
  }, [W, H, hole.x, hole.y])
  const face = useMemo(() => normalizeUVs(new THREE.ShapeGeometry(roundedRect(W - 0.02, H - 0.02, 0.17), 24)), [W, H])
  const g = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (g.current) g.current.rotation.z = Math.sin(clock.elapsedTime * 0.9) * 0.06
  })
  // The tag sits at the origin so the camera orbits (and the sway pivots)
  // around the picture, with the ring and chain hanging above it.
  return (
    <group ref={g}>
      <group position={[0, 0, 0]}>
        <mesh geometry={tag} castShadow>
          <meshPhysicalMaterial color="#ffffff" roughness={0.15} clearcoat={1} clearcoatRoughness={0.1} />
        </mesh>
        <mesh geometry={face} position={[0, 0, 0.066]}>
          <meshStandardMaterial map={texture} roughness={0.3} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
        <mesh geometry={face} position={[0, 0, -0.066]} rotation={[0, Math.PI, 0]}>
          <meshStandardMaterial map={texture} roughness={0.3} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
        {/* split ring through the hole, then two chain links up to a bigger ring */}
        <mesh position={[hole.x, hole.y + 0.3, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.33, 0.035, 16, 64]} />
          <meshStandardMaterial color="#e9edf3" metalness={1} roughness={0.15} />
        </mesh>
        <mesh position={[hole.x, hole.y + 0.74, 0]}>
          <torusGeometry args={[0.15, 0.03, 12, 48]} />
          <meshStandardMaterial color="#e9edf3" metalness={1} roughness={0.15} />
        </mesh>
        <mesh position={[hole.x, hole.y + 1.1, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.3, 0.04, 16, 64]} />
          <meshStandardMaterial color="#e9edf3" metalness={1} roughness={0.15} />
        </mesh>
      </group>
    </group>
  )
}

/* ---------------- MOUSEPAD ---------------- */
export function Mousepad({ texture }: ProductProps) {
  const W = 3.6
  const H = 2.9
  const body = useMemo(() => extruded(roundedRect(W, H, 0.16), 0.06, 0.01), [])
  const top = useMemo(() => normalizeUVs(new THREE.ShapeGeometry(roundedRect(W - 0.01, H - 0.01, 0.155), 24)), [])
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
      <mesh geometry={body} receiveShadow>
        <meshStandardMaterial color="#15181d" roughness={0.9} />
      </mesh>
      <mesh geometry={top} position={[0, 0, 0.041]}>
        <meshStandardMaterial map={texture} roughness={0.85} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      {/* a mouse resting on it */}
      <group position={[1.05, -0.5, 0.26]} rotation={[0, 0, -0.25]}>
        <mesh castShadow scale={[0.36, 0.55, 0.22]}>
          <sphereGeometry args={[1, 48, 32]} />
          <meshPhysicalMaterial color="#f4f6fa" roughness={0.25} clearcoat={0.6} />
        </mesh>
        <mesh position={[0, 0.2, 0.2]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.03, 0.3, 0.02]} />
          <meshStandardMaterial color="#c9d4e3" />
        </mesh>
      </group>
    </group>
  )
}

/* ---------------- PUZZLE ---------------- */
export function Puzzle({ texture, aspect }: ProductProps) {
  const W = 3.8
  const H = W / aspect
  return (
    <group rotation={[-Math.PI / 2, 0, 0.08]} position={[0, -0.6, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[W, H, 0.08]} />
        {[0, 1, 2, 3, 5].map((i) => (
          <meshStandardMaterial key={i} attach={`material-${i}`} color="#b89a6a" roughness={1} />
        ))}
        <meshStandardMaterial attach="material-4" map={texture} roughness={0.75} />
      </mesh>
    </group>
  )
}
