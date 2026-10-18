import { useState } from 'react'
import { Box, Brush } from 'lucide-react'
import { Layout, Segmented, Toasts } from '@ui'
import Paint2D from './Paint2D'
import Paint3D from './Paint3D'
import './paint.css'

export default function App(): JSX.Element {
  const [mode, setMode] = useState<'2d' | '3d'>('2d')
  return (
    <Layout>
      <div className="mode-switch">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { id: '2d', label: <><Brush size={13} /> Dessin</> },
            { id: '3d', label: <><Box size={13} /> 3D</> }
          ]}
        />
      </div>
      {/* Les deux restent montés : on ne perd pas son dessin en passant à la 3D. */}
      <div className="mode" style={{ display: mode === '2d' ? 'flex' : 'none' }}>
        <Paint2D active={mode === '2d'} />
      </div>
      <div className="mode" style={{ display: mode === '3d' ? 'flex' : 'none' }}>
        <Paint3D active={mode === '3d'} />
      </div>
      <Toasts />
    </Layout>
  )
}
