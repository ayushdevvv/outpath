import { useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import OutboxMark from '@/components/OutboxMark'

// Palette matches the reference key art: white/cyan traffic against the
// brand's red relay light — no green in the hero scene itself.
const ACCENT = '#3D8BFF'
const PASS = '#5ED4FF'
const EDGE = '#243036'
// The brand's red counterweight — the relay's own light, distinct from the
// green "verified" packets that pass through it.
const FLARE = '#FF4D5E'

/* ---------------------------------------------------------------- geometry */

const CLIENT = new THREE.Vector3(-4.6, 0, 0)
const OUTBOX = new THREE.Vector3(0, 0.25, 0)
const SERVER = new THREE.Vector3(4.6, 0, 0)

// The server's own query to its database — a short dip down and behind,
// not a fourth stop on the main client/relay/server line. Reads as
// infrastructure the server owns, not another hop in the request path.
const DATABASE = new THREE.Vector3(4.85, -0.95, -1.5)

const queryCurve = new THREE.CatmullRomCurve3([
  SERVER.clone(),
  new THREE.Vector3(SERVER.x + 0.3, -0.4, -0.75),
  DATABASE.clone(),
])
const answerCurve = new THREE.CatmullRomCurve3([
  DATABASE.clone(),
  new THREE.Vector3(SERVER.x - 0.15, -0.4, -0.75),
  SERVER.clone(),
])

// Requests arc over the top, responses return underneath. Two distinct lanes,
// because a single line would not say which direction data is moving.
const outboundCurve = new THREE.CatmullRomCurve3([
  CLIENT.clone(),
  new THREE.Vector3(-2.3, 0.95, 0.15),
  OUTBOX.clone(),
  new THREE.Vector3(2.3, 0.95, -0.15),
  SERVER.clone(),
])

const returnCurve = new THREE.CatmullRomCurve3([
  SERVER.clone(),
  new THREE.Vector3(2.3, -0.9, 0.2),
  OUTBOX.clone().setY(-0.15),
  new THREE.Vector3(-2.3, -0.9, -0.2),
  CLIENT.clone(),
])

/* ------------------------------------------------------------------ pieces */

function Lane({ curve, color, opacity, halo = true }) {
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 90, 0.016, 8, false), [curve])
  const haloGeometry = useMemo(() => new THREE.TubeGeometry(curve, 90, 0.055, 8, false), [curve])
  return (
    <group>
      {halo && (
        <mesh geometry={haloGeometry}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity * 0.22}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      )}
      <mesh geometry={geometry}>
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** A single packet running the lane. Offset staggers the convoy. */
function Packet({ curve, color, offset, speed, paused }) {
  const ref = useRef()
  const t = useRef(offset)

  useFrame((_, delta) => {
    if (!ref.current) return
    if (!paused) t.current = (t.current + delta * speed) % 1
    const p = curve.getPointAt(t.current)
    ref.current.position.copy(p)
    // Packets brighten as they pass through the outbox node at the centre.
    const nearNode = 1 - Math.min(Math.abs(p.x) / 1.6, 1)
    ref.current.scale.setScalar(0.85 + nearNode * 0.9)
  })

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.055, 12, 12]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  )
}

/** A query/answer packet on the server↔database lane — brightens as it
 *  nears the database rather than the outbox, since this lane is a
 *  side-trip the server takes on its own, not part of the main relay. */
function DbPacket({ curve, color, offset, speed, towardEnd, paused }) {
  const ref = useRef()
  const t = useRef(offset)

  useFrame((_, delta) => {
    if (!ref.current) return
    if (!paused) t.current = (t.current + delta * speed) % 1
    const p = curve.getPointAt(t.current)
    ref.current.position.copy(p)
    const proximity = towardEnd ? t.current : 1 - t.current
    ref.current.scale.setScalar(0.7 + proximity * 0.8)
  })

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.045, 10, 10]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  )
}

/** A tumbling data chip — a small rotating box rather than a sphere, so
 *  the convoy reads as discrete packets of data, not a generic particle
 *  trail. Used sparingly alongside the plain Packet spheres. */
function Chip({ curve, color, offset, speed, paused }) {
  const ref = useRef()
  const t = useRef(offset)

  useFrame(({ clock }, delta) => {
    if (!ref.current) return
    if (!paused) t.current = (t.current + delta * speed) % 1
    const p = curve.getPointAt(t.current)
    ref.current.position.copy(p)
    ref.current.rotation.x = clock.elapsedTime * 1.4
    ref.current.rotation.y = clock.elapsedTime * 1.1
  })

  return (
    <mesh ref={ref}>
      <boxGeometry args={[0.07, 0.07, 0.07]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} roughness={0.3} toneMapped={false} />
    </mesh>
  )
}

/** The client: a thin stack of translucent panes, like open request tabs. */
function ClientNode() {
  const group = useRef()
  useFrame(({ clock }) => {
    if (group.current) group.current.position.y = Math.sin(clock.elapsedTime * 0.6) * 0.07
  })
  return (
    <group ref={group} position={CLIENT}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, i * 0.16 - 0.16, -i * 0.12]} rotation={[0, 0.35, 0]}>
          <boxGeometry args={[1.05, 0.02, 0.72]} />
          <meshStandardMaterial
            color="#0E181C"
            emissive={PASS}
            emissiveIntensity={0.08 + i * 0.05}
            roughness={0.35}
            metalness={0.6}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
      <mesh rotation={[0, 0.35, 0]}>
        <boxGeometry args={[1.08, 0.5, 0.75]} />
        <meshBasicMaterial color={EDGE} wireframe transparent opacity={0.45} />
      </mesh>
      <group position={[0, -0.5, 0]}>
        <Platform color={PASS} radius={0.68} />
      </group>
    </group>
  )
}

/**
 * Cheap "bloom" — a few additively-blended spheres, each bigger and
 * dimmer than the last. No postprocessing pass required, so the hero
 * stays a single lightweight canvas.
 */
function Glow({ color, breathe }) {
  const inner = useRef()
  useFrame(({ clock }) => {
    if (!inner.current || !breathe) return
    const s = 1 + Math.sin(clock.elapsedTime * 2.1) * 0.08
    inner.current.scale.setScalar(s)
  })
  const LAYERS = [
    { scale: 0.62, opacity: 0.5 },
    { scale: 0.95, opacity: 0.22 },
    { scale: 1.5, opacity: 0.1 },
  ]
  return (
    <group>
      {LAYERS.map((l, i) => (
        <mesh key={l.scale} ref={i === 0 ? inner : undefined} scale={l.scale}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={l.opacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

/** A thin lit ring on the ground plane beneath a node — the podium each
 *  piece of the pipeline stands on, tying the scene to a single floor
 *  rather than letting nodes float in undifferentiated space. */
function Platform({ color, radius = 0.85 }) {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[radius * 0.74, radius, 48, 1]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <circleGeometry args={[radius * 0.9, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.07} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/**
 * The relay: the hero of the scene, not a backdrop element. A dark,
 * bevelled cube — not an abstract crystal — carries the OB mark on its
 * face, exactly like the mark on every other surface of the product.
 * Red light pools on the platform beneath it (the brand's own color),
 * while the green cage and packets are the traffic passing through.
 */
function OutboxNode() {
  const core = useRef()
  const cage = useRef()
  const ringGroup = useRef()
  const mark = useRef()

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime
    if (core.current) {
      core.current.rotation.y += delta * 0.35
      core.current.rotation.x = Math.sin(t * 0.4) * 0.12
    }
    if (cage.current) {
      cage.current.rotation.y -= delta * 0.25
      cage.current.rotation.z += delta * 0.12
    }
    if (ringGroup.current) {
      ringGroup.current.rotation.y += delta * 0.05
    }
    if (mark.current) {
      mark.current.position.y = OUTBOX.y + 0.02 + Math.sin(t * 1.4) * 0.02
    }
  })

  const RINGS = [
    { radius: 1.05, speedZ: 0.09, tilt: 0.6 },
    { radius: 1.32, speedZ: -0.06, tilt: 1.15 },
    { radius: 1.62, speedZ: 0.045, tilt: 1.7 },
    { radius: 1.98, speedZ: -0.03, tilt: 2.2 },
  ]

  return (
    <group position={OUTBOX}>
      <group position={[0, -0.58, 0]}>
        <Platform color={FLARE} radius={0.82} />
      </group>

      <Glow color={FLARE} breathe />

      <RoundedBox ref={core} args={[0.86, 0.86, 0.86]} radius={0.1} smoothness={4}>
        <meshStandardMaterial
          color="#070A0C"
          emissive={FLARE}
          emissiveIntensity={0.1}
          roughness={0.3}
          metalness={0.75}
        />
      </RoundedBox>
      <mesh ref={cage}>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshBasicMaterial color={ACCENT} wireframe transparent opacity={0.2} />
      </mesh>

      {/* The mark, billboarded so it always reads front-on, the way it
          does everywhere else in the product — not warped by the cube's
          own rotation. */}
      <group ref={mark}>
        <Html center transform sprite distanceFactor={5} occlude={false} style={{ pointerEvents: 'none' }}>
          <OutboxMark className="h-11 w-auto drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]" />
        </Html>
      </group>

      <pointLight color={FLARE} intensity={9} distance={7} decay={2} />
      <pointLight color={ACCENT} intensity={4} distance={6} decay={2} />

      {/* Layered rings, each its own speed and tilt — routing, not decoration. */}
      <group ref={ringGroup}>
        {RINGS.map((r, i) => (
          <Ring key={r.radius} {...r} index={i} />
        ))}
      </group>
    </group>
  )
}

function Ring({ radius, speedZ, tilt, index }) {
  const ref = useRef()
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * speedZ
  })
  return (
    <mesh ref={ref} rotation={[Math.PI / 2 + tilt, index * 0.7, 0]}>
      <torusGeometry args={[radius, 0.0035, 8, 120]} />
      <meshBasicMaterial color={ACCENT} transparent opacity={0.34 - index * 0.055} toneMapped={false} />
    </mesh>
  )
}

/** The server: racked units with status lights along the front edge. */
function ServerNode() {
  const group = useRef()
  useFrame(({ clock }) => {
    if (group.current) group.current.position.y = Math.cos(clock.elapsedTime * 0.5) * 0.06
  })
  return (
    <group ref={group} position={SERVER} rotation={[0, -0.4, 0]}>
      {[-0.42, -0.14, 0.14, 0.42].map((y, i) => (
        <group key={y} position={[0, y, 0]}>
          <mesh>
            <boxGeometry args={[0.95, 0.22, 0.85]} />
            <meshStandardMaterial color="#0F181C" roughness={0.5} metalness={0.75} />
          </mesh>
          <mesh position={[0.49, 0, 0.3]}>
            <sphereGeometry args={[0.028, 8, 8]} />
            <meshBasicMaterial color={i === 2 ? ACCENT : PASS} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <mesh>
        <boxGeometry args={[1.0, 1.16, 0.9]} />
        <meshBasicMaterial color={EDGE} wireframe transparent opacity={0.4} />
      </mesh>
      <group position={[0, -0.66, 0]} rotation={[0, 0.4, 0]}>
        <Platform color={ACCENT} radius={0.78} />
      </group>
    </group>
  )
}

/**
 * The database: a cylinder, not a box, so it reads immediately as storage
 * rather than another compute node. Stacked emissive platters suggest
 * disks; a slow independent spin (never in sync with the relay's) says
 * this is its own system, queried rather than routed through.
 */
function DatabaseNode() {
  const group = useRef()
  const platters = useRef()

  useFrame(({ clock }, delta) => {
    if (platters.current) platters.current.rotation.y += delta * 0.32
    if (group.current) {
      group.current.position.y = DATABASE.y + Math.sin(clock.elapsedTime * 0.5 + 2) * 0.04
    }
  })

  const PLATTER_Y = [-0.22, -0.075, 0.075, 0.22]

  return (
    <group ref={group} position={DATABASE}>
      <Glow color={PASS} breathe={false} />

      <group ref={platters}>
        {PLATTER_Y.map((y, i) => (
          <mesh key={y} position={[0, y, 0]}>
            <cylinderGeometry args={[0.52, 0.52, 0.05, 32]} />
            <meshStandardMaterial
              color="#0E181C"
              emissive={PASS}
              emissiveIntensity={0.3 + i * 0.06}
              roughness={0.3}
              metalness={0.7}
              transparent
              opacity={0.92}
            />
          </mesh>
        ))}
        <mesh>
          <cylinderGeometry args={[0.58, 0.58, 0.58, 28, 1, true]} />
          <meshBasicMaterial color={EDGE} wireframe transparent opacity={0.42} />
        </mesh>
      </group>

      <pointLight color={PASS} intensity={4.5} distance={4.5} decay={2} />
    </group>
  )
}

/** Field of particles pulled steadily toward the relay, then respawned at
 *  the rim — reads as traffic being drawn in, not ambient dust drifting by. */
function Traffic({ count = 260 }) {
  const ref = useRef()

  const state = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const radius = new Float32Array(count)
    const angle = new Float32Array(count)
    const height = new Float32Array(count)
    const speed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      radius[i] = 2.4 + Math.random() * 7.5
      angle[i] = Math.random() * Math.PI * 2
      height[i] = (Math.random() - 0.5) * 6.5
      speed[i] = 0.16 + Math.random() * 0.34
    }
    return { positions, radius, angle, height, speed }
  }, [count])

  useFrame((_, delta) => {
    if (!ref.current) return
    const { positions, radius, angle, height, speed } = state
    for (let i = 0; i < count; i++) {
      radius[i] -= delta * speed[i]
      angle[i] += delta * 0.05
      if (radius[i] < 0.7) {
        radius[i] = 8.5 + Math.random() * 2
        angle[i] = Math.random() * Math.PI * 2
        height[i] = (Math.random() - 0.5) * 6.5
      }
      // Particles settle toward the equator as they converge, like traffic
      // funneling into the relay rather than passing through at random heights.
      const pull = Math.min(radius[i] / 9, 1)
      positions[i * 3] = Math.cos(angle[i]) * radius[i]
      positions[i * 3 + 1] = height[i] * pull
      positions[i * 3 + 2] = Math.sin(angle[i]) * radius[i] - 2
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[state.positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.03} color="#4C6670" transparent opacity={0.6} sizeAttenuation />
    </points>
  )
}

/** Camera answers the pointer, gently. Disabled when motion is reduced. */
function CameraRig({ enabled }) {
  const { camera, pointer } = useThree()
  const target = useMemo(() => new THREE.Vector3(0, 0, 0), [])

  useFrame(() => {
    if (!enabled) return
    camera.position.x += (pointer.x * 0.9 - camera.position.x) * 0.035
    camera.position.y += (pointer.y * 0.45 + 0.35 - camera.position.y) * 0.035
    camera.lookAt(target)
  })
  return null
}

/* ------------------------------------------------------------------ scene */

export default function HeroScene() {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.35, 9.5], fov: 42 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      frameloop={reduced ? 'demand' : 'always'}
      onCreated={({ scene }) => {
        scene.fog = new THREE.FogExp2('#060A0C', 0.055)
      }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 6, 4]} intensity={0.6} color="#9FD8FF" />
      <directionalLight position={[-6, -2, -3]} intensity={0.25} color={ACCENT} />

      <CameraRig enabled={!reduced} />

      <Lane curve={outboundCurve} color={PASS} opacity={0.32} />
      <Lane curve={returnCurve} color="#5EA8FF" opacity={0.24} />

      <ClientNode />
      <OutboxNode />
      <ServerNode />
      <DatabaseNode />

      {[0, 0.34, 0.67].map((o) => (
        <Packet key={`out-${o}`} curve={outboundCurve} color={PASS} offset={o} speed={0.22} paused={reduced} />
      ))}
      {[0.12, 0.6].map((o) => (
        <Packet key={`in-${o}`} curve={returnCurve} color="#5EA8FF" offset={o} speed={0.19} paused={reduced} />
      ))}
      <Chip curve={outboundCurve} color={FLARE} offset={0.5} speed={0.22} paused={reduced} />
      <Chip curve={returnCurve} color={ACCENT} offset={0.86} speed={0.19} paused={reduced} />

      <Lane curve={queryCurve} color={PASS} opacity={0.22} />
      <Lane curve={answerCurve} color={ACCENT} opacity={0.22} />
      <DbPacket curve={queryCurve} color={PASS} offset={0} speed={0.4} towardEnd paused={reduced} />
      <DbPacket curve={answerCurve} color={ACCENT} offset={0.5} speed={0.4} paused={reduced} />

      <Traffic />
    </Canvas>
  )
}
