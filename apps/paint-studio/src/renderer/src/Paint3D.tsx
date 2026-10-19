import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import fontJson from 'three/examples/fonts/helvetiker_bold.typeface.json'
import {
  ArrowDownToLine,
  Box,
  Camera,
  ChevronDown,
  Circle,
  Cone,
  Copy,
  Crosshair,
  Cylinder,
  Diamond,
  Donut,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Heart,
  ImageUp,
  Lamp,
  Lightbulb,
  Lock,
  LockOpen,
  Magnet,
  Move3d,
  Pill,
  Pyramid,
  Redo2,
  RefreshCw,
  Rotate3d,
  Save,
  Scale3d,
  Send,
  Square,
  Star,
  Sun,
  Trash2,
  Type,
  Undo2,
  Upload
} from 'lucide-react'
import { Modal, toast, usePrompt, useFileDrop } from '@ui'
import { typing } from './Paint2D'
import { bridge, loadImageFile, IMAGE_EXT } from './shared'

// Atelier 3D (façon Paint 3D, en plus complet) : formes, texte 3D, matériaux, lumières,
// textures (y compris le dessin 2D), import/export de modèles, projets.

type ShapeKind =
  | 'box'
  | 'rounded'
  | 'sphere'
  | 'lowpoly'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'knot'
  | 'pyramid'
  | 'gem'
  | 'capsule'
  | 'plane'
  | 'disc'
  | 'heart'
  | 'star'
type Mode = 'translate' | 'rotate' | 'scale'
type Preset = 'plastic' | 'matte' | 'metal' | 'chrome' | 'gold' | 'glass' | 'neon' | 'rubber' | 'clay'
type EnvKind = 'studio' | 'sunset' | 'night' | 'outdoor' | 'flat'

const SHAPES: { id: ShapeKind; label: string; icon: JSX.Element }[] = [
  { id: 'box', label: 'Cube', icon: <Box size={16} /> },
  { id: 'rounded', label: 'Cube arrondi', icon: <Square size={16} /> },
  { id: 'sphere', label: 'Sphère', icon: <Circle size={16} /> },
  { id: 'lowpoly', label: 'Sphère low-poly', icon: <Diamond size={16} /> },
  { id: 'cylinder', label: 'Cylindre', icon: <Cylinder size={16} /> },
  { id: 'cone', label: 'Cône', icon: <Cone size={16} /> },
  { id: 'pyramid', label: 'Pyramide', icon: <Pyramid size={16} /> },
  { id: 'torus', label: 'Anneau', icon: <Donut size={16} /> },
  { id: 'knot', label: 'Nœud', icon: <RefreshCw size={16} /> },
  { id: 'gem', label: 'Diamant', icon: <Diamond size={16} /> },
  { id: 'capsule', label: 'Capsule', icon: <Pill size={16} /> },
  { id: 'heart', label: 'Cœur', icon: <Heart size={16} /> },
  { id: 'star', label: 'Étoile', icon: <Star size={16} /> },
  { id: 'plane', label: 'Plaque', icon: <Square size={16} /> },
  { id: 'disc', label: 'Disque', icon: <Circle size={16} /> }
]
const COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#ffffff', '#9ca3af', '#111827']
const PRESETS: { id: Preset; label: string }[] = [
  { id: 'plastic', label: 'Plastique' },
  { id: 'matte', label: 'Mat' },
  { id: 'clay', label: 'Pâte à modeler' },
  { id: 'rubber', label: 'Caoutchouc' },
  { id: 'metal', label: 'Métal brossé' },
  { id: 'chrome', label: 'Chrome' },
  { id: 'gold', label: 'Or' },
  { id: 'glass', label: 'Verre' },
  { id: 'neon', label: 'Néon lumineux' }
]
const ENVS: { id: EnvKind; label: string; sky: number; ground: number; sun: number; sunI: number; hemiI: number; envI: number; bg: string }[] = [
  { id: 'studio', label: 'Studio', sky: 0xffffff, ground: 0x444466, sun: 0xffffff, sunI: 1.6, hemiI: 1.1, envI: 0.6, bg: '#1f2230' },
  { id: 'sunset', label: 'Coucher de soleil', sky: 0xffb38a, ground: 0x3a2040, sun: 0xff9a55, sunI: 2.2, hemiI: 0.9, envI: 0.45, bg: '#3b1f2b' },
  { id: 'night', label: 'Nuit', sky: 0x4060a0, ground: 0x080810, sun: 0x9fb4ff, sunI: 0.6, hemiI: 0.35, envI: 0.15, bg: '#070912' },
  { id: 'outdoor', label: 'Plein air', sky: 0xbfe3ff, ground: 0x6b7a4a, sun: 0xfff4d6, sunI: 2.6, hemiI: 1.2, envI: 0.7, bg: '#9cc9ef' },
  { id: 'flat', label: 'Lumière douce', sky: 0xffffff, ground: 0xffffff, sun: 0xffffff, sunI: 0.5, hemiI: 2, envI: 0.9, bg: '#e5e7eb' }
]
const MOD = /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'
const PROJECT_EXT = 'os3d'
const MODEL_EXT = ['glb', 'gltf', 'obj', 'stl']

const font = new FontLoader().parse(fontJson as never)

function extruded(shape: THREE.Shape, depth = 0.35): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 4, curveSegments: 24 })
  g.center()
  return g
}

function geometry(kind: ShapeKind): THREE.BufferGeometry {
  switch (kind) {
    case 'box':
      return new THREE.BoxGeometry(1, 1, 1)
    case 'rounded':
      return new RoundedBoxGeometry(1, 1, 1, 6, 0.15)
    case 'sphere':
      return new THREE.SphereGeometry(0.6, 48, 32)
    case 'lowpoly':
      return new THREE.IcosahedronGeometry(0.6, 1)
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1.1, 48)
    case 'cone':
      return new THREE.ConeGeometry(0.6, 1.2, 48)
    case 'torus':
      return new THREE.TorusGeometry(0.5, 0.18, 24, 64)
    case 'knot':
      return new THREE.TorusKnotGeometry(0.45, 0.14, 160, 20)
    case 'pyramid':
      return new THREE.ConeGeometry(0.7, 1.1, 4)
    case 'gem':
      return new THREE.OctahedronGeometry(0.65)
    case 'capsule':
      return new THREE.CapsuleGeometry(0.35, 0.6, 12, 32)
    case 'plane':
      return new THREE.BoxGeometry(1.6, 0.05, 1.6)
    case 'disc':
      return new THREE.CylinderGeometry(0.8, 0.8, 0.06, 64)
    case 'heart': {
      const s = new THREE.Shape()
      s.moveTo(0, -0.55)
      s.bezierCurveTo(-0.15, -0.4, -0.6, -0.15, -0.6, 0.15)
      s.bezierCurveTo(-0.6, 0.45, -0.25, 0.6, 0, 0.32)
      s.bezierCurveTo(0.25, 0.6, 0.6, 0.45, 0.6, 0.15)
      s.bezierCurveTo(0.6, -0.15, 0.15, -0.4, 0, -0.55)
      return extruded(s)
    }
    case 'star': {
      const s = new THREE.Shape()
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 5
        const r = i % 2 ? 0.28 : 0.65
        if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
        else s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      }
      return extruded(s, 0.3)
    }
  }
}

function textGeometry(text: string): THREE.BufferGeometry {
  const g = new TextGeometry(text, { font, size: 0.5, depth: 0.16, curveSegments: 8, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 3 })
  g.center()
  // En géométrie simple : sauvegarde et annulation sans dépendre de la police.
  return new THREE.BufferGeometry().copy(g)
}

const isMesh = (o: THREE.Object3D): o is THREE.Mesh => (o as THREE.Mesh).isMesh === true
const meshesOf = (o: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = []
  o.traverse((c) => isMesh(c) && !c.userData.helper && out.push(c))
  return out
}
const materialsOf = (o: THREE.Object3D): THREE.MeshPhysicalMaterial[] =>
  meshesOf(o).flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material])) as THREE.MeshPhysicalMaterial[]
const lightOf = (o: THREE.Object3D): THREE.PointLight | THREE.SpotLight | null =>
  ((o as THREE.PointLight).isLight ? (o as THREE.PointLight) : null)

function applyPreset(m: THREE.MeshPhysicalMaterial, p: Preset): void {
  m.transmission = 0
  m.opacity = 1
  m.transparent = false
  m.emissiveIntensity = 0
  m.clearcoat = 0
  m.metalness = 0
  m.roughness = 0.5
  if (!m.isMeshPhysicalMaterial) {
    /* modèle importé : on garde ce qui est commun */
  }
  switch (p) {
    case 'plastic':
      m.roughness = 0.35
      m.clearcoat = 0.4
      break
    case 'matte':
      m.roughness = 1
      break
    case 'clay':
      m.roughness = 0.85
      m.sheen = 0.6
      break
    case 'rubber':
      m.roughness = 0.95
      m.color.multiplyScalar(0.6)
      break
    case 'metal':
      m.metalness = 1
      m.roughness = 0.38
      break
    case 'chrome':
      m.metalness = 1
      m.roughness = 0.04
      m.color.set('#f2f2f2')
      break
    case 'gold':
      m.metalness = 1
      m.roughness = 0.22
      m.color.set('#e6b84d')
      break
    case 'glass':
      m.transmission = 1
      m.roughness = 0.04
      m.thickness = 0.6
      m.ior = 1.5
      break
    case 'neon':
      m.emissive.copy(m.color)
      m.emissiveIntensity = 2.2
      m.roughness = 0.4
      break
  }
  m.needsUpdate = true
}

function newMaterial(color: string): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ color })
  applyPreset(m, 'plastic')
  return m
}

const deg = (r: number): number => Math.round(THREE.MathUtils.radToDeg(r) * 10) / 10
const r3 = (n: number): number => Math.round(n * 100) / 100

/** Données binaires lues sur le disque. */
async function readBytes(path: string): Promise<ArrayBuffer> {
  const bin = atob(await window.kit.files.readBase64(path))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

interface Three {
  scene: THREE.Scene
  world: THREE.Group
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  orbit: OrbitControls
  gizmo: TransformControls
  grid: THREE.GridHelper
  ground: THREE.Mesh
  hemi: THREE.HemisphereLight
  sun: THREE.DirectionalLight
}

export default function Paint3D({ active }: { active: boolean }): JSX.Element {
  const mount = useRef<HTMLDivElement>(null)
  const three = useRef<Three | null>(null)
  const [selected, setSelected] = useState<THREE.Object3D | null>(null)
  const [mode, setMode] = useState<Mode>('translate')
  const [count, setCount] = useState(0)
  const [, tick] = useState(0)
  const [env, setEnv] = useState<EnvKind>('studio')
  const [bg, setBg] = useState<'transparent' | 'env' | 'custom'>('transparent')
  const [bgColor, setBgColor] = useState('#1f2230')
  const [showGrid, setShowGrid] = useState(true)
  const [shadows, setShadows] = useState(true)
  const [snap, setSnap] = useState(false)
  const [spin, setSpin] = useState(false)
  const [shapesOpen, setShapesOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [docPath, setDocPath] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [promptNode, ask] = usePrompt()
  /** Couleur suivante : un compteur à part, à jour même si on ajoute deux formes d'affilée. */
  const nextColor = useRef(0)
  const history = useRef<{ undo: string[]; redo: string[] }>({ undo: [], redo: [] })
  const loader = useRef(new THREE.ObjectLoader())

  // Scène non vide : Open Studio garde l'interface chargée (elle n'est pas enregistrée).
  useEffect(() => {
    window.studio?.setBusy(count > 0)
    return () => window.studio?.setBusy(false)
  }, [count > 0])

  const refresh = (): void => {
    const t = three.current
    if (t) setCount(t.world.children.length)
    tick((n) => n + 1)
  }

  useEffect(() => {
    const el = mount.current!
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 500)
    camera.position.set(4, 3.5, 5)
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    el.appendChild(renderer.domElement)

    // Reflets réalistes pour le métal et le verre.
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.6

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444466, 1.1)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(5, 8, 4)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -10
    sun.shadow.camera.right = 10
    sun.shadow.camera.top = 10
    sun.shadow.camera.bottom = -10
    scene.add(sun)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.2 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
    const grid = new THREE.GridHelper(20, 40, 0x888888, 0x444444)
    ;(grid.material as THREE.Material).opacity = 0.3
    ;(grid.material as THREE.Material).transparent = true
    scene.add(grid)
    const world = new THREE.Group()
    world.name = 'Scène'
    scene.add(world)

    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.target.set(0, 0.5, 0)
    const gizmo = new TransformControls(camera, renderer.domElement)
    gizmo.addEventListener('dragging-changed', (e) => {
      const dragging = (e as unknown as { value: boolean }).value
      orbit.enabled = !dragging
      if (dragging) snapshot()
    })
    gizmo.addEventListener('objectChange', () => tick((n) => n + 1))
    scene.add(gizmo.getHelper())
    three.current = { scene, world, camera, renderer, orbit, gizmo, grid, ground, hemi, sun }

    // Clic sur un objet : sélection (on remonte jusqu'à l'objet de premier niveau).
    const ray = new THREE.Raycaster()
    let downAt = 0
    const onDown = (): void => void (downAt = Date.now())
    const onUp = (e: PointerEvent): void => {
      if (Date.now() - downAt > 250 || gizmo.dragging || e.button !== 0) return
      const r = renderer.domElement.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const hit = ray.intersectObjects(world.children, true).find((h) => {
        let o: THREE.Object3D = h.object
        while (o.parent && o.parent !== world) o = o.parent
        return o.visible && !o.userData.locked
      })
      let obj: THREE.Object3D | null = hit?.object ?? null
      while (obj && obj.parent && obj.parent !== world) obj = obj.parent
      select(obj)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    let raf = 0
    const loop = (): void => {
      orbit.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()
    const ro = new ResizeObserver(() => {
      if (!el.clientWidth || !el.clientHeight) return
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      pmrem.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => three.current?.gizmo.setMode(mode), [mode])
  useEffect(() => {
    const t = three.current
    if (!t) return
    t.gizmo.setTranslationSnap(snap ? 0.25 : null)
    t.gizmo.setRotationSnap(snap ? THREE.MathUtils.degToRad(15) : null)
    t.gizmo.setScaleSnap(snap ? 0.1 : null)
  }, [snap])
  useEffect(() => {
    const t = three.current
    if (!t) return
    t.orbit.autoRotate = spin
    t.orbit.autoRotateSpeed = 2
  }, [spin])
  useEffect(() => {
    const t = three.current
    if (!t) return
    const e = ENVS.find((x) => x.id === env)!
    t.hemi.color.setHex(e.sky)
    t.hemi.groundColor.setHex(e.ground)
    t.hemi.intensity = e.hemiI
    t.sun.color.setHex(e.sun)
    t.sun.intensity = e.sunI
    t.scene.environmentIntensity = e.envI
    t.scene.background = bg === 'transparent' ? null : new THREE.Color(bg === 'env' ? e.bg : bgColor)
    t.grid.visible = showGrid
    t.sun.castShadow = shadows
    t.ground.visible = shadows
  }, [env, bg, bgColor, showGrid, shadows])

  // ───────────── Sélection et historique ─────────────

  const select = (o: THREE.Object3D | null): void => {
    const t = three.current!
    if (o && !o.userData.locked) t.gizmo.attach(o)
    else t.gizmo.detach()
    setSelected(o)
  }

  /** Mémorise la scène avant une modification (annulable). */
  const snapshot = (): void => {
    const t = three.current
    if (!t) return
    history.current.undo.push(JSON.stringify(t.world.toJSON()))
    if (history.current.undo.length > 30) history.current.undo.shift()
    history.current.redo = []
  }
  const restore = (json: string): void => {
    const t = three.current!
    const g = loader.current.parse(JSON.parse(json))
    t.gizmo.detach()
    t.world.clear()
    for (const c of [...g.children]) t.world.add(c)
    setSelected(null)
    refresh()
  }
  const step = (from: 'undo' | 'redo'): void => {
    const t = three.current!
    const json = history.current[from].pop()
    if (!json) return
    history.current[from === 'undo' ? 'redo' : 'undo'].push(JSON.stringify(t.world.toJSON()))
    restore(json)
  }

  const place = (o: THREE.Object3D, name: string): void => {
    const t = three.current!
    snapshot()
    o.name = name
    o.traverse((c) => {
      if (isMesh(c)) {
        c.castShadow = true
        c.receiveShadow = true
      }
    })
    if (!o.position.lengthSq()) o.position.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)
    t.world.add(o)
    dropToGround(o, false)
    select(o)
    refresh()
  }

  const add = (kind: ShapeKind): void => {
    setShapesOpen(false)
    const mesh = new THREE.Mesh(geometry(kind), newMaterial(COLORS[nextColor.current++ % COLORS.length]))
    place(mesh, SHAPES.find((s) => s.id === kind)!.label)
  }

  const addText = async (): Promise<void> => {
    const text = await ask('Texte en 3D', 'Bonjour')
    if (!text) return
    const mesh = new THREE.Mesh(textGeometry(text), newMaterial(COLORS[nextColor.current++ % COLORS.length]))
    mesh.userData.text = text
    place(mesh, `Texte « ${text.slice(0, 20)} »`)
  }
  const editText = async (): Promise<void> => {
    if (!selected || !isMesh(selected) || !selected.userData.text) return
    const text = await ask('Modifier le texte', selected.userData.text)
    if (!text) return
    snapshot()
    selected.geometry.dispose()
    selected.geometry = textGeometry(text)
    selected.userData.text = text
    selected.name = `Texte « ${text.slice(0, 20)} »`
    refresh()
  }

  const addLight = (kind: 'point' | 'spot'): void => {
    const color = kind === 'point' ? 0xffd27f : 0xffffff
    const light = kind === 'point' ? new THREE.PointLight(color, 8, 12) : new THREE.SpotLight(color, 20, 15, Math.PI / 6, 0.35)
    light.castShadow = true
    light.position.set(0, 2.5, 0)
    if (light instanceof THREE.SpotLight) {
      light.target.position.set(0, -2.5, 0)
      light.add(light.target)
    }
    // Petite ampoule visible pour pouvoir cliquer dessus (cachée à l'export).
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color }))
    bulb.userData.helper = true
    light.add(bulb)
    snapshot()
    light.name = kind === 'point' ? 'Lampe' : 'Projecteur'
    three.current!.world.add(light)
    select(light)
    refresh()
  }

  // ───────────── Actions sur l'objet ─────────────

  const remove = (): void => {
    if (!selected) return
    snapshot()
    three.current!.gizmo.detach()
    selected.removeFromParent()
    setSelected(null)
    refresh()
  }
  const duplicate = (): void => {
    if (!selected) return
    snapshot()
    const copy = selected.clone()
    copy.traverse((c) => {
      if (isMesh(c)) c.material = Array.isArray(c.material) ? c.material.map((m) => m.clone()) : c.material.clone()
    })
    copy.position.x += 0.8
    copy.name = `${selected.name} (copie)`
    three.current!.world.add(copy)
    select(copy)
    refresh()
  }
  const dropToGround = (o: THREE.Object3D | null = selected, remember = true): void => {
    if (!o || lightOf(o)) return
    if (remember) snapshot()
    const box = new THREE.Box3().setFromObject(o)
    if (!box.isEmpty()) o.position.y -= box.min.y
    tick((n) => n + 1)
  }
  const focus = (): void => {
    const t = three.current!
    const box = selected ? new THREE.Box3().setFromObject(selected) : new THREE.Box3().setFromObject(t.world)
    if (box.isEmpty()) return
    const center = box.getCenter(new THREE.Vector3())
    const radius = Math.max(0.5, box.getSize(new THREE.Vector3()).length() / 2)
    const dir = t.camera.position.clone().sub(t.orbit.target).normalize()
    t.orbit.target.copy(center)
    t.camera.position.copy(center).add(dir.multiplyScalar(radius * 3))
  }
  const view = (v: 'persp' | 'front' | 'top' | 'side'): void => {
    const t = three.current!
    const d = t.camera.position.distanceTo(t.orbit.target)
    const off = { persp: new THREE.Vector3(1, 0.8, 1.2), front: new THREE.Vector3(0, 0, 1), top: new THREE.Vector3(0, 1, 0.0001), side: new THREE.Vector3(1, 0, 0) }[v]
    t.camera.position.copy(t.orbit.target).add(off.normalize().multiplyScalar(d))
  }
  const toggle = (o: THREE.Object3D, key: 'visible' | 'locked'): void => {
    if (key === 'visible') o.visible = !o.visible
    else {
      o.userData.locked = !o.userData.locked
      if (o.userData.locked && selected === o) three.current!.gizmo.detach()
      if (!o.userData.locked && selected === o) three.current!.gizmo.attach(o)
    }
    tick((n) => n + 1)
  }

  const mats = selected ? materialsOf(selected) : []
  const mat = mats[0]
  const light = selected ? lightOf(selected) : null
  const setMat = (fn: (m: THREE.MeshPhysicalMaterial) => void): void => {
    mats.forEach((m) => {
      fn(m)
      m.needsUpdate = true
    })
    tick((n) => n + 1)
  }
  const paint = (hex: string): void =>
    setMat((m) => {
      m.color.set(hex)
      if (m.emissiveIntensity > 0) m.emissive.set(hex)
    })

  const setTexture = (img: HTMLCanvasElement | null): void => {
    if (!selected) return
    snapshot()
    setMat((m) => {
      m.map?.dispose()
      if (img) {
        const tex = new THREE.CanvasTexture(img)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        m.map = tex
        m.color.set('#ffffff')
      } else m.map = null
    })
  }
  const textureFromFile = async (): Promise<void> => {
    const [path] = await window.kit.files.open({ title: 'Image à plaquer sur l’objet', filters: [{ name: 'Images', extensions: IMAGE_EXT }] })
    if (path) setTexture(await loadImageFile(path))
  }
  const textureFromDrawing = (): void => {
    const c = bridge.drawing?.()
    if (!c) return void toast('Le dessin 2D n’est pas disponible.', 'error')
    setTexture(c)
    toast('Le dessin 2D est plaqué sur l’objet', 'success')
  }

  // ───────────── Fichiers ─────────────

  /** Rendu de la vue sans gizmo ni grille, en haute définition. */
  const renderImage = (factor = 2): HTMLCanvasElement => {
    const t = three.current!
    t.gizmo.detach()
    const gridWas = t.grid.visible
    t.grid.visible = false
    const helpers: THREE.Object3D[] = []
    t.world.traverse((o) => o.userData.helper && o.visible && (helpers.push(o), (o.visible = false)))
    const pr = t.renderer.getPixelRatio()
    t.renderer.setPixelRatio(pr * factor)
    t.renderer.render(t.scene, t.camera)
    const out = document.createElement('canvas')
    out.width = t.renderer.domElement.width
    out.height = t.renderer.domElement.height
    out.getContext('2d')!.drawImage(t.renderer.domElement, 0, 0)
    t.renderer.setPixelRatio(pr)
    helpers.forEach((o) => (o.visible = true))
    t.grid.visible = gridWas
    if (selected && !selected.userData.locked) t.gizmo.attach(selected)
    return out
  }

  const exportAs = async (kind: 'png' | 'glb' | 'obj' | 'stl' | 'layer'): Promise<void> => {
    setExportOpen(false)
    const t = three.current!
    if (kind === 'layer') {
      if (!bridge.addLayer) return
      bridge.addLayer(renderImage(1), 'Rendu 3D')
      return void toast('Rendu ajouté comme calque dans le Dessin', 'success')
    }
    const names = { png: 'Image PNG', glb: 'Modèle 3D (GLB)', obj: 'Modèle 3D (OBJ)', stl: 'Impression 3D (STL)' }
    const path = await window.kit.files.save({ title: 'Exporter', defaultPath: `scene-3d.${kind}`, filters: [{ name: names[kind], extensions: [kind] }] })
    if (!path) return
    try {
      if (kind === 'png') {
        await window.kit.files.writeBase64(path, renderImage(2).toDataURL('image/png').split(',')[1])
      } else {
        const helpers: THREE.Object3D[] = []
        t.world.traverse((o) => o.userData.helper && (helpers.push(o), (o.visible = false)))
        if (kind === 'glb') {
          const buf = (await new GLTFExporter().parseAsync(t.world, { binary: true, onlyVisible: true })) as ArrayBuffer
          await window.kit.files.writeBase64(path, toBase64(buf))
        } else if (kind === 'obj') {
          await window.kit.files.writeText(path, new OBJExporter().parse(t.world))
        } else {
          await window.kit.files.writeText(path, new STLExporter().parse(t.world) as string)
        }
        helpers.forEach((o) => (o.visible = true))
      }
      toast('Exporté', 'success')
    } catch {
      toast('L’export a échoué.', 'error')
    }
  }

  const saveProject = async (as = false): Promise<void> => {
    const t = three.current!
    let path = as ? null : docPath
    if (!path) path = await window.kit.files.save({ title: 'Enregistrer la scène', defaultPath: `scene.${PROJECT_EXT}`, filters: [{ name: 'Scène 3D modifiable', extensions: [PROJECT_EXT] }] })
    if (!path) return
    const data = {
      app: 'paint-studio-3d',
      version: 1,
      world: t.world.toJSON(),
      settings: { env, bg, bgColor, showGrid, shadows },
      camera: { position: t.camera.position.toArray(), target: t.orbit.target.toArray() }
    }
    await window.kit.files.writeText(path, JSON.stringify(data))
    setDocPath(path)
    window.studio?.setBusy(false)
    toast('Scène enregistrée', 'success')
  }

  const importModel = async (path: string): Promise<void> => {
    const ext = path.split('.').pop()!.toLowerCase()
    const name = path.split(/[\\/]/).pop()!
    try {
      let obj: THREE.Object3D
      if (ext === 'glb' || ext === 'gltf') {
        const data = ext === 'glb' ? await readBytes(path) : await window.kit.files.readText(path)
        const gltf = await new GLTFLoader().parseAsync(data, '')
        obj = gltf.scene
      } else if (ext === 'obj') {
        obj = new OBJLoader().parse(await window.kit.files.readText(path))
        obj.traverse((c) => isMesh(c) && (c.material = newMaterial('#cbd5e1')))
      } else {
        const g = new STLLoader().parse(await readBytes(path))
        g.computeVertexNormals()
        obj = new THREE.Mesh(g, newMaterial('#cbd5e1'))
      }
      // Mise à l'échelle : le modèle tient dans environ 2 unités, posé au centre.
      const box = new THREE.Box3().setFromObject(obj)
      const size = box.getSize(new THREE.Vector3()).length() || 1
      const wrapper = new THREE.Group()
      const center = box.getCenter(new THREE.Vector3())
      obj.position.sub(center)
      wrapper.add(obj)
      wrapper.scale.setScalar(2.4 / size)
      wrapper.position.set(0, 0.01, 0)
      place(wrapper, name)
    } catch {
      toast('Ce modèle n’a pas pu être importé.', 'error')
    }
  }

  const openPath = async (path: string): Promise<void> => {
    const ext = path.split('.').pop()!.toLowerCase()
    if (MODEL_EXT.includes(ext)) return importModel(path)
    if (IMAGE_EXT.includes(ext)) {
      if (!selected) return void toast('Sélectionne d’abord un objet pour y plaquer cette image.', 'info')
      return setTexture(await loadImageFile(path))
    }
    if (ext !== PROJECT_EXT) return void toast('Format non pris en charge.', 'error')
    try {
      const p = JSON.parse(await window.kit.files.readText(path)) as {
        world: unknown
        settings?: { env: EnvKind; bg: 'transparent' | 'env' | 'custom'; bgColor: string; showGrid: boolean; shadows: boolean }
        camera?: { position: number[]; target: number[] }
      }
      snapshot()
      restore(JSON.stringify(p.world))
      if (p.settings) {
        setEnv(p.settings.env)
        setBg(p.settings.bg)
        setBgColor(p.settings.bgColor)
        setShowGrid(p.settings.showGrid)
        setShadows(p.settings.shadows)
      }
      if (p.camera) {
        const t = three.current!
        t.camera.position.fromArray(p.camera.position)
        t.orbit.target.fromArray(p.camera.target)
      }
      setDocPath(path)
      window.studio?.setBusy(false)
    } catch {
      toast('Impossible d’ouvrir cette scène.', 'error')
    }
  }
  const open = async (): Promise<void> => {
    const [path] = await window.kit.files.open({
      title: 'Ouvrir une scène ou importer un modèle',
      filters: [{ name: 'Scènes et modèles 3D', extensions: [PROJECT_EXT, ...MODEL_EXT] }]
    })
    if (path) await openPath(path)
  }
  const drop = useFileDrop((paths) => paths[0] && void openPath(paths[0]))

  const clearScene = (): void => {
    snapshot()
    three.current!.gizmo.detach()
    three.current!.world.clear()
    setSelected(null)
    setDocPath(null)
    refresh()
  }

  // ───────────── Clavier ─────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!active || typing(e)) return
      const k = e.key.toLowerCase()
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl) {
        const map: Record<string, () => void> = {
          z: () => step(e.shiftKey ? 'redo' : 'undo'),
          y: () => step('redo'),
          d: duplicate,
          s: () => void saveProject(e.shiftKey),
          o: () => void open()
        }
        if (map[k]) {
          e.preventDefault()
          map[k]()
        }
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') remove()
      else if (e.key === 'Escape') select(null)
      else if (k === 'g') setMode('translate')
      else if (k === 'r') setMode('rotate')
      else if (k === 's') setMode('scale')
      else if (k === 'f') focus()
      else if (k === 'b') dropToGround()
      else if (e.key === '1') view('front')
      else if (e.key === '3') view('side')
      else if (e.key === '7') view('top')
      else if (e.key === '5') view('persp')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ───────────── Interface ─────────────

  const objects = three.current?.world.children ?? []
  const vec = (label: string, v: THREE.Vector3 | THREE.Euler, kind: 'pos' | 'rot' | 'scale'): JSX.Element => (
    <div className="vec-row">
      <span className="faint">{label}</span>
      {(['x', 'y', 'z'] as const).map((a) => (
        <input
          key={a}
          className="input vec-input"
          type="number"
          step={kind === 'rot' ? 5 : 0.1}
          value={kind === 'rot' ? deg((v as THREE.Euler)[a]) : r3((v as THREE.Vector3)[a])}
          onFocus={snapshot}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isNaN(n)) return
            if (kind === 'rot') (v as THREE.Euler)[a] = THREE.MathUtils.degToRad(n)
            else (v as THREE.Vector3)[a] = kind === 'scale' && n === 0 ? 0.001 : n
            tick((x) => x + 1)
          }}
          title={a.toUpperCase()}
        />
      ))}
    </div>
  )
  const slider = (label: string, value: number, min: number, max: number, set: (n: number) => void, stepN = 0.05): JSX.Element => (
    <label className="faint">
      {label}
      <input type="range" min={min} max={max} step={stepN} value={value} onPointerDown={snapshot} onChange={(e) => (set(Number(e.target.value)), tick((x) => x + 1))} />
    </label>
  )

  return (
    <div className="paint">
      <div className="ui-toolbar">
        <div className="menu-wrap">
          <button className={`btn btn-sm ${shapesOpen ? 'on' : 'btn-primary'}`} onClick={() => setShapesOpen(!shapesOpen)}>
            <Box size={14} /> Ajouter une forme <ChevronDown size={12} />
          </button>
          {shapesOpen && (
            <div className="menu shapes-menu" onMouseLeave={() => setShapesOpen(false)}>
              {SHAPES.map((s) => (
                <button key={s.id} onClick={() => add(s.id)}>
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => void addText()}>
          <Type size={14} /> Texte 3D
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => addLight('point')} title="Lampe qui éclaire tout autour">
          <Lightbulb size={14} /> Lampe
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => addLight('spot')} title="Projecteur orientable">
          <Lamp size={14} /> Projecteur
        </button>
        <span className="sep" />
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => step('undo')} title={`Annuler (${MOD}+Z)`}>
          <Undo2 size={15} />
        </button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => step('redo')} title={`Rétablir (${MOD}+Y)`}>
          <Redo2 size={15} />
        </button>
        <span className="sep" />
        <button className="btn btn-ghost btn-sm" onClick={() => void open()} title={`Ouvrir une scène, importer GLB/OBJ/STL (${MOD}+O) — ou glisse le fichier ici`}>
          <FolderOpen size={14} /> Ouvrir / importer
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => void saveProject()} title={`Enregistrer la scène (${MOD}+S)`}>
          <Save size={14} /> Enregistrer
        </button>
        <div className="menu-wrap">
          <button className={`btn btn-sm ${exportOpen ? 'on' : 'btn-ghost'}`} onClick={() => setExportOpen(!exportOpen)} disabled={!count}>
            <Download size={14} /> Exporter <ChevronDown size={12} />
          </button>
          {exportOpen && (
            <div className="menu" onMouseLeave={() => setExportOpen(false)}>
              <button onClick={() => void exportAs('png')}>
                <Camera size={13} /> Image PNG haute définition
              </button>
              <button onClick={() => void exportAs('layer')}>
                <Send size={13} /> Envoyer le rendu vers le Dessin 2D
              </button>
              <hr />
              <button onClick={() => void exportAs('glb')}>Modèle 3D .glb (Blender, web, jeux)</button>
              <button onClick={() => void exportAs('obj')}>Modèle 3D .obj</button>
              <button onClick={() => void exportAs('stl')}>Impression 3D .stl</button>
            </div>
          )}
        </div>
        <div className="spacer" />
        <div className="segmented" title="Point de vue (5, 1, 3, 7)">
          <button onClick={() => view('persp')}>3/4</button>
          <button onClick={() => view('front')}>Face</button>
          <button onClick={() => view('side')}>Côté</button>
          <button onClick={() => view('top')}>Dessus</button>
        </div>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={focus} title="Recentrer sur la sélection (F)">
          <Crosshair size={15} />
        </button>
        <button className={`btn btn-sm btn-icon ${spin ? 'on' : 'btn-ghost'}`} onClick={() => setSpin(!spin)} title="Faire tourner la vue (présentation)">
          <RefreshCw size={15} />
        </button>
        <button className={`btn btn-sm btn-icon ${snap ? 'on' : 'btn-ghost'}`} onClick={() => setSnap(!snap)} title="Aimanter (pas de 0,25 et 15°)">
          <Magnet size={15} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setHelpOpen(true)}>
          ?
        </button>
      </div>

      <div className="paint-body">
        <aside className="layers outliner">
          <div className="layers-head">
            <b>Objets ({objects.length})</b>
            {objects.length > 0 && (
              <button className="btn btn-ghost btn-sm btn-icon" onClick={clearScene} title="Tout effacer">
                <Trash2 size={13} />
              </button>
            )}
          </div>
          <div className="layers-list">
            {objects.map((o) => (
              <div key={o.uuid} className={`layer${o === selected ? ' on' : ''}`} onClick={() => select(o)}>
                <span className="obj-icon">{lightOf(o) ? <Lightbulb size={12} /> : o.userData.text ? <Type size={12} /> : <Box size={12} />}</span>
                <span className="layer-name" onDoubleClick={() => void ask('Nom de l’objet', o.name).then((n) => n && ((o.name = n), tick((x) => x + 1)))}>
                  {o.name || 'Objet'}
                </span>
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(o, 'locked')
                  }}
                >
                  {o.userData.locked ? <Lock size={12} /> : <LockOpen size={12} className="faint-icon" />}
                </button>
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(o, 'visible')
                  }}
                >
                  {o.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
              </div>
            ))}
            {!objects.length && <p className="faint tiny-p">Ajoute une forme, un texte, ou glisse un modèle 3D (.glb, .obj, .stl) dans la vue.</p>}
          </div>
          <div className="layer-tools">
            <b className="faint">Ambiance</b>
            <select className="select select-sm" value={env} onChange={(e) => setEnv(e.target.value as EnvKind)}>
              {ENVS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
            <select className="select select-sm" value={bg} onChange={(e) => setBg(e.target.value as 'transparent' | 'env' | 'custom')}>
              <option value="transparent">Fond transparent</option>
              <option value="env">Fond de l’ambiance</option>
              <option value="custom">Fond de couleur</option>
            </select>
            {bg === 'custom' && <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />}
            <label className="ui-row faint">
              <input type="checkbox" checked={shadows} onChange={(e) => setShadows(e.target.checked)} /> Ombres
            </label>
            <label className="ui-row faint">
              <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grille
            </label>
          </div>
        </aside>

        <div className={`stage3d${drop.over ? ' drop' : ''}`} ref={mount} {...drop.bind}>
          {!count && (
            <div className="hint3d">
              <Sun size={22} />
              <p>Ajoute une forme ou un texte 3D, puis fais tourner la vue à la souris (clic droit pour déplacer, molette pour zoomer).</p>
              <p className="faint">Tu peux aussi glisser ici un modèle .glb, .obj ou .stl.</p>
            </div>
          )}
          {selected && !light && (
            <div className="float-bar">
              <div className="segmented">
                <button className={mode === 'translate' ? 'on' : ''} onClick={() => setMode('translate')} title="Déplacer (G)">
                  <Move3d size={14} />
                </button>
                <button className={mode === 'rotate' ? 'on' : ''} onClick={() => setMode('rotate')} title="Tourner (R)">
                  <Rotate3d size={14} />
                </button>
                <button className={mode === 'scale' ? 'on' : ''} onClick={() => setMode('scale')} title="Taille (S)">
                  <Scale3d size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="layers props">
          <div className="layers-head">
            <b>{selected ? selected.name || 'Objet' : 'Aucune sélection'}</b>
          </div>
          {selected ? (
            <div className="layer-tools first">
              {vec('Position', selected.position, 'pos')}
              {vec('Rotation °', selected.rotation, 'rot')}
              {!light && vec('Échelle', selected.scale, 'scale')}
              {!light && (
                <div className="ui-row wrap-row">
                  <button className="btn btn-ghost btn-sm" onClick={() => dropToGround()} title="Poser sur le sol (B)">
                    <ArrowDownToLine size={13} /> Au sol
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      snapshot()
                      selected.rotation.set(0, 0, 0)
                      selected.scale.set(1, 1, 1)
                      tick((n) => n + 1)
                    }}
                  >
                    Réinitialiser
                  </button>
                </div>
              )}

              {light && (
                <>
                  <b className="faint">Lumière</b>
                  <input type="color" value={`#${light.color.getHexString()}`} onChange={(e) => (light.color.set(e.target.value), tick((n) => n + 1))} />
                  {slider('Puissance', light.intensity, 0, light instanceof THREE.SpotLight ? 80 : 40, (n) => (light.intensity = n), 0.5)}
                  {slider('Portée', light.distance, 1, 40, (n) => (light.distance = n), 0.5)}
                  {light instanceof THREE.SpotLight && slider('Ouverture', light.angle, 0.1, 1.2, (n) => (light.angle = n), 0.02)}
                  {light instanceof THREE.SpotLight && slider('Bord doux', light.penumbra, 0, 1, (n) => (light.penumbra = n))}
                </>
              )}

              {mat && (
                <>
                  <b className="faint">Matière</b>
                  <div className="palette wide">
                    {COLORS.map((c) => (
                      <button key={c} className={`#${mat.color.getHexString()}` === c ? 'on' : ''} style={{ background: c }} onClick={() => (snapshot(), paint(c))} />
                    ))}
                  </div>
                  <input type="color" value={`#${mat.color.getHexString()}`} onFocus={snapshot} onChange={(e) => paint(e.target.value)} />
                  <select
                    className="select select-sm"
                    value=""
                    onChange={(e) => {
                      snapshot()
                      setMat((m) => applyPreset(m, e.target.value as Preset))
                    }}
                  >
                    <option value="" disabled>
                      Style de matière…
                    </option>
                    {PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {slider('Brillance', 1 - mat.roughness, 0, 1, (n) => setMat((m) => (m.roughness = 1 - n)))}
                  {slider('Métal', mat.metalness, 0, 1, (n) => setMat((m) => (m.metalness = n)))}
                  {mat.isMeshPhysicalMaterial && slider('Transparence (verre)', mat.transmission, 0, 1, (n) => setMat((m) => (m.transmission = n)))}
                  {slider('Opacité', mat.opacity, 0.05, 1, (n) =>
                    setMat((m) => {
                      m.opacity = n
                      m.transparent = n < 1
                    })
                  )}
                  {slider('Lueur', mat.emissiveIntensity, 0, 4, (n) =>
                    setMat((m) => {
                      m.emissive.copy(m.color)
                      m.emissiveIntensity = n
                    })
                  )}
                  <label className="ui-row faint">
                    <input type="checkbox" checked={mat.wireframe} onChange={(e) => (snapshot(), setMat((m) => (m.wireframe = e.target.checked)))} /> Fil de fer
                  </label>
                  <label className="ui-row faint">
                    <input type="checkbox" checked={mat.flatShading} onChange={(e) => (snapshot(), setMat((m) => (m.flatShading = e.target.checked)))} /> Facettes visibles
                  </label>

                  <b className="faint">Texture</b>
                  <div className="ui-row wrap-row">
                    <button className="btn btn-ghost btn-sm" onClick={textureFromDrawing} title="Plaque le dessin de l’onglet Dessin sur l’objet">
                      <Upload size={13} /> Mon dessin 2D
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => void textureFromFile()}>
                      <ImageUp size={13} /> Une image…
                    </button>
                    {mat.map && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setTexture(null)}>
                        Retirer
                      </button>
                    )}
                  </div>
                  {mat.map &&
                    slider('Répétition', mat.map.repeat.x, 1, 8, (n) => {
                      mats.forEach((m) => m.map?.repeat.set(n, n))
                      tick((x) => x + 1)
                    }, 1)}
                </>
              )}

              {selected.userData.text && (
                <button className="btn btn-secondary btn-sm" onClick={() => void editText()}>
                  <Type size={13} /> Modifier le texte
                </button>
              )}
              <div className="ui-row">
                <button className="btn btn-secondary btn-sm" onClick={duplicate}>
                  <Copy size={13} /> Dupliquer
                </button>
                <button className="btn btn-danger btn-sm" onClick={remove}>
                  <Trash2 size={13} /> Supprimer
                </button>
              </div>
            </div>
          ) : (
            <p className="faint" style={{ padding: '0 4px' }}>
              Clique sur un objet pour le placer au millimètre, changer sa matière (métal, verre, néon…), y plaquer une image ou ton dessin 2D.
            </p>
          )}
        </aside>
      </div>
      {promptNode}
      {helpOpen && (
        <Modal title="Raccourcis de l’atelier 3D" onClose={() => setHelpOpen(false)}>
          <div className="shortcuts">
            <span>Tourner la vue</span>
            <kbd>clic gauche + glisser</kbd>
            <span>Déplacer la vue</span>
            <kbd>clic droit + glisser</kbd>
            <span>Zoom</span>
            <kbd>molette</kbd>
            <span>Déplacer / tourner / taille</span>
            <kbd>G · R · S</kbd>
            <span>Recentrer</span>
            <kbd>F</kbd>
            <span>Poser au sol</span>
            <kbd>B</kbd>
            <span>Vues 3/4, face, côté, dessus</span>
            <kbd>5 · 1 · 3 · 7</kbd>
            <span>Dupliquer</span>
            <kbd>{MOD}+D</kbd>
            <span>Supprimer</span>
            <kbd>Suppr</kbd>
            <span>Annuler / rétablir</span>
            <kbd>{MOD}+Z · {MOD}+Y</kbd>
            <span>Enregistrer la scène</span>
            <kbd>{MOD}+S</kbd>
          </div>
        </Modal>
      )}
    </div>
  )
}
