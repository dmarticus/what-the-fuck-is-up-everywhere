import { useState, type ReactElement } from 'react'
import { App as QuickMaker } from './App'
import { VideoStudio } from './ai/VideoStudio'
import './ai/studio.css'

export function App(): ReactElement {
  const [mode, setMode] = useState<'ai' | 'quick'>('ai')
  return <div className={mode === 'ai' ? 'studio-page' : 'quick-page'}>
    <nav className="studio-nav" aria-label="Maker mode">
      <a className="studio-brand" href={window.location.pathname}><span>!</span> WTF IS UP.</a>
      <div className="studio-modes"><button aria-pressed={mode === 'ai'} onClick={() => setMode('ai')}>✦ AI video</button><button aria-pressed={mode === 'quick'} onClick={() => setMode('quick')}>Quick GIF</button></div>
      <span className="studio-local">Personal video studio</span>
    </nav>
    {mode === 'ai' ? <VideoStudio /> : <div className="quick-mode"><QuickMaker /></div>}
  </div>
}
