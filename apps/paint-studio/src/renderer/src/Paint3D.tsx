import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { Box, Camera, Circle, Cone, Copy, Cylinder, Diamond, Donut, Move3d, Pyramid, Rotate3d, Scale3d, Trash2 } from 'lucide-react'
import { toast, useTheme } from '@ui'
import { typing } from './Paint2D'

// Atelier 3D (façon Paint 3D) : on ajoute des formes, on les colore, on les place, on exporte.

type ShapeKind = 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'pyramid' | 'gem'
type Mode = 'translate' | 'rotate' | 'scale'

const SHAPES: { id: ShapeKind; label: string; icon: JSX.Element }[] = [
  { id: 'box', label: 'Cube', icon: <Box size={17} /> },
  { id: 'sphere', label: 'Sphère', icon: <Circle size={17} /> },
  { id: 'cylinder', label: 'Cylindre', icon: <Cylinder size={17} /> },
  { id: 'cone', label: 'Cône', icon: <Cone size={17} /> },
  { id: 'torus', label: 'Anneau', icon: <Donut size={17} /> },
  { id: 'pyramid', label: 'Pyramide', icon: <Pyramid size={17} /> },
  { id: 'gem', label: 'Diamant', icon: <Diamond size={17} /> }
]
const COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#ffffff', '#9ca3af', '#111827']

function geometry(kind: ShapeKind): THREE.BufferGeometry {
  switch (kind) {
    case 'box':
      return new THREE.BoxGeometry(1, 1, 1)
    case 'sphere':
      return new THREE.SphereGeometry(0.6, 48, 32)
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1.1, 48)
    case 'cone':
      return new THREE.ConeGeometry(0.6, 1.2, 48)
    case 'torus':
      return new THREE.TorusGeometry(0.5, 0.18, 24, 64)
    case 'pyramid':
      return new THREE.ConeGeometry(0.7, 1.1, 4)
    case 'gem':
      return new THREE.OctahedronGeometry(0.65)
  }
}

export default function Paint3D({ active }: { active: boolean }): JSX.Element {
  const mount = useRef<HTMLDivElement>(null)
  const three = useRef<{ scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; orbit: OrbitControls; gizmo: TransformControls; grid: THREE.GridHelper } | null>(null)
  const [selected, setSelected] = useState<THREE.Mesh | null>(null)
  const [mode, setMode] = useState<Mode>('translate')
  const [count, setCount] = useState(0)
  /** Couleur suivante : un compteur à part, à jour même si on ajoute deux formes d'affilée. */
  const nextColor = useRef(0)
  const [, tick] = useState(0)
  const theme = useTheme()

  useEffect(() => {
    const el = mount.current!
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 200)
    camera.position.set(4, 3.5, 5)
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.shadowMap.enabled = true
    el.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.1))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(5, 8, 4)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    scene.add(sun)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.18 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    ground.userData.fixed = true
    scene.add(ground)
    const grid = new THREE.GridHelper(20, 20, 0x888888, 0x444444)
    ;(grid.material as THREE.Material).opacity = 0.35
    ;(grid.material as THREE.Material).transparent = true
    scene.add(grid)

    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.target.set(0, 0.5, 0)
    const gizmo = new TransformControls(camera, renderer.domElement)
    gizmo.addEventListener('dragging-changed', (e) => (orbit.enabled = !(e as unknown as { value: boolean }).value))
    gizmo.addEventListener('objectChange', () => tick((n) => n + 1))
    scene.add(gizmo.getHelper())
    three.current = { scene, camera, renderer, orbit, gizmo, grid }

    // Clic sur une forme : sélection.
    const ray = new THREE.Raycaster()
    let downAt = 0
    const onDown = (): void => void (downAt = Date.now())
    const onUp = (e: PointerEvent): void => {
      if (Date.now() - downAt > 250 || gizmo.dragging) return
      const r = renderer.domElement.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const hit = ray.intersectObjects(scene.children.filter((o) => o instanceof THREE.Mesh && !o.userData.fixed))[0]
      const mesh = (hit?.object as THREE.Mesh) ?? null
      if (mesh) gizmo.attach(mesh)
      else gizmo.detach()
      setSelected(mesh)
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
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => three.current?.gizmo.setMode(mode), [mode])
  useEffect(() => {
    if (three.current) three.current.scene.background = null
  }, [theme])

  const add = (kind: ShapeKind): void => {
    const t = three.current!
    const mesh = new THREE.Mesh(geometry(kind), new THREE.MeshStandardMaterial({ color: COLORS[nextColor.current++ % COLORS.length], roughness: 0.45, metalness: 0.05 }))
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.position.set((Math.random() - 0.5) * 2, 0.6, (Math.random() - 0.5) * 2)
    t.scene.add(mesh)
    t.gizmo.attach(mesh)
    setSelected(mesh)
    setCount((c) => c + 1)
  }

  const material = selected?.material as THREE.MeshStandardMaterial | undefined
  const paint = (hex: string): void => {
    material?.color.set(hex)
    tick((n) => n + 1)
  }

  const remove = (): void => {
    if (!selected) return
    three.current!.gizmo.detach()
    three.current!.scene.remove(selected)
    setSelected(null)
    setCount((c) => c - 1)
  }
  const duplicate = (): void => {
    if (!selected) return
    const copy = selected.clone()
    copy.material = (selected.material as THREE.Material).clone()
    copy.position.x += 0.8
    three.current!.scene.add(copy)
    three.current!.gizmo.attach(copy)
    setSelected(copy)
    setCount((c) => c + 1)
  }

  const exportPng = async (): Promise<void> => {
    const t = three.current!
    t.gizmo.detach()
    t.grid.visible = false
    t.renderer.render(t.scene, t.camera)
    const data = t.renderer.domElement.toDataURL('image/png')
    t.grid.visible = true
    if (selected) t.gizmo.attach(selected)
    const path = await window.kit.files.save({ title: 'Exporter la scène', defaultPath: 'scene-3d.png', filters: [{ name: 'PNG', extensions: ['png'] }] })
    if (!path) return
    await window.kit.files.writeBase64(path, data.split(',')[1])
    toast('Image exportée (fond transparent)', 'success')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!active || typing(e)) return
      if (e.key === 'Delete' || e.key === 'Backspace') remove()
      if (e.key.toLowerCase() === 'g') setMode('translate')
      if (e.key.toLowerCase() === 'r') setMode('rotate')
      if (e.key.toLowerCase() === 's' && !e.ctrlKey) setMode('scale')
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="paint">
      <div className="ui-toolbar">
        {SHAPES.map((s) => (
          <button key={s.id} className="btn btn-ghost btn-sm" onClick={() => add(s.id)} title={`Ajouter : ${s.label}`}>
            {s.icon} {s.label}
          </button>
        ))}
        <div className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => void exportPng()} disabled={!count}>
          <Camera size={14} /> Exporter en image
        </button>
      </div>
      <div className="paint-body">
        <div className="stage3d" ref={mount}>
          {!count && <div className="hint3d">Ajoute une forme avec la barre du haut, puis fais tourner la vue à la souris (clic droit pour déplacer, molette pour zoomer).</div>}
        </div>
        <aside className="layers">
          <div className="layers-head">
            <b>{selected ? 'Forme sélectionnée' : 'Aucune sélection'}</b>
          </div>
          {selected && material ? (
            <div className="layer-tools">
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
              <div className="palette wide">
                {COLORS.map((c) => (
                  <button key={c} className={`#${material.color.getHexString()}` === c ? 'on' : ''} style={{ background: c }} onClick={() => paint(c)} />
                ))}
              </div>
              <input type="color" value={`#${material.color.getHexString()}`} onChange={(e) => paint(e.target.value)} />
              <label className="faint">
                Brillance
                <input type="range" min={0} max={1} step={0.05} value={1 - material.roughness} onChange={(e) => ((material.roughness = 1 - Number(e.target.value)), tick((n) => n + 1))} />
              </label>
              <label className="faint">
                Métal
                <input type="range" min={0} max={1} step={0.05} value={material.metalness} onChange={(e) => ((material.metalness = Number(e.target.value)), tick((n) => n + 1))} />
              </label>
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
              Clique sur une forme pour la colorer, la déplacer, la tourner ou changer sa taille.
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}
