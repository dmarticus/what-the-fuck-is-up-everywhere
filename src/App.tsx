import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from 'react'
import { cleanAddress, dimensions, getScene, matchScene, scenes, type SceneChoice, type Shape } from './scenes'
import { drawScene, type RenderOptions } from './render'
import { exportGif } from './export'

function Icon({ name, size = 18 }: { name: 'arrow' | 'download' | 'pause' | 'play' | 'upload' | 'link' | 'sound' | 'check'; size?: number }): ReactElement {
  const paths = {
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    download: <path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5" />,
    pause: <path d="M8 5v14M16 5v14" />,
    play: <path d="m8 4 12 8-12 8Z" />,
    upload: <path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" />,
    link: <path d="m10 14 4-4m-6 2-2 2a4 4 0 0 0 6 6l3-3m-6-10 3-3a4 4 0 0 1 6 6l-2 2" />,
    sound: <path d="M11 4 5 9H2v6h3l6 5ZM16 9l6 6m0-6-6 6" />,
    check: <path d="m4 12 5 5L20 6" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function readPreset(): { address: string; choice: SceneChoice; shape: Shape; duration: number; energy: number } {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const scene = params.get('scene')
  const shape = params.get('shape')
  const duration = Number(params.get('duration'))
  const energy = Number(params.get('energy'))
  return {
    address: cleanAddress(params.get('to') ?? "Denny's"),
    choice: scenes.some((candidate) => candidate.id === scene) ? scene as SceneChoice : 'auto',
    shape: shape === 'square' || shape === 'wide' ? shape : 'classic',
    duration: [2, 3, 4].includes(duration) ? duration : 3,
    energy: [0.5, 1, 2].includes(energy) ? energy : 1,
  }
}

function SceneCard({ scene, selected, onSelect }: { scene: typeof scenes[number]; selected: boolean; onSelect: () => void }): ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (context) drawScene(context, 160, 100, 0.12, { address: '', scene: scene.id, energy: 1, seed: 0, photo: null, video: null, captions: false })
  }, [scene.id])
  return <button className={`scene-card ${selected ? 'selected' : ''}`} type="button" aria-pressed={selected} onClick={onSelect}>
    <canvas ref={canvas} width={160} height={100} aria-hidden="true" />
    <span>{scene.name}{selected && <Icon name="check" size={13} />}</span>
  </button>
}

export function App(): ReactElement {
  const [preset] = useState(readPreset)
  const [address, setAddress] = useState(preset.address)
  const [choice, setChoice] = useState<SceneChoice>(preset.choice)
  const [shape, setShape] = useState<Shape>(preset.shape)
  const [duration, setDuration] = useState(preset.duration)
  const [energy, setEnergy] = useState(preset.energy)
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null)
  const [photoName, setPhotoName] = useState('')
  const [loadingPhoto, setLoadingPhoto] = useState(false)
  const [video] = useState(() => document.createElement('video'))
  const [mediaStatus, setMediaStatus] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ url: string; size: number } | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const upload = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const photoRequest = useRef(0)
  const scene = getScene(address, choice)
  const size = dimensions(shape)
  const normalizedAddress = cleanAddress(address)
  const busy = exporting || loadingPhoto
  const options: RenderOptions = { address: normalizedAddress, scene: scene.id, energy, seed: 0, photo, video: mediaStatus === 'ready' ? video : null }

  useEffect(() => {
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    const ready = (): void => { clearTimeout(timeout); setMediaStatus('ready') }
    const failed = (): void => { clearTimeout(timeout); setMediaStatus('fallback') }
    const timeout = setTimeout(failed, 15000)
    video.addEventListener('loadeddata', ready)
    video.addEventListener('error', failed)
    video.src = `${import.meta.env.BASE_URL}media/original.mp4`
    video.load()
    return (): void => {
      clearTimeout(timeout)
      video.removeEventListener('loadeddata', ready)
      video.removeEventListener('error', failed)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [video])

  useEffect(() => {
    if (paused || exporting || scene.id !== 'diner' || photo) video.pause()
    else if (mediaStatus === 'ready') {
      video.playbackRate = energy
      void video.play().catch(() => setPaused(true))
    }
  }, [video, paused, exporting, scene.id, photo, mediaStatus, energy])

  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    let request = 0
    const start = performance.now()
    const render = (now: number): void => {
      if (!exporting && video.currentTime >= Math.min(duration * energy, video.duration || Infinity)) video.currentTime = 0
      drawScene(context, size.width, size.height, paused || exporting ? 0 : ((now - start) / 1000) % duration, options)
      if (!paused && !exporting) request = requestAnimationFrame(render)
    }
    render(start)
    return (): void => cancelAnimationFrame(request)
  }, [address, choice, energy, shape, photo, mediaStatus, paused, exporting, duration])

  useEffect(() => { setResult(null); setCopied(false) }, [address, choice, shape, duration, energy, photo])
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url) }, [result])
  useEffect(() => () => { abort.current?.abort(); photoRequest.current += 1 }, [])

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return
    setError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError('Choose a JPG, PNG, or WebP image under 10 MB.')
      return
    }
    const request = ++photoRequest.current
    setLoadingPhoto(true)
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      if (request !== photoRequest.current) return
      if (image.naturalWidth * image.naturalHeight > 24_000_000) throw new Error('Choose a photo under 24 megapixels.')
      setPhoto(image)
      setPhotoName(file.name)
    } catch (failure) {
      if (request === photoRequest.current) setError(failure instanceof Error && failure.message.includes('megapixels') ? failure.message : 'This image could not load. Try another JPG, PNG, or WebP image.')
    } finally {
      URL.revokeObjectURL(url)
      if (request === photoRequest.current) setLoadingPhoto(false)
    }
  }

  async function makeGif(): Promise<void> {
    if (abort.current || busy || !normalizedAddress) return
    const controller = new AbortController()
    abort.current = controller
    setExporting(true)
    setProgress(0)
    setError('')
    setResult(null)
    try {
      const blob = await exportGif(options, size.width, size.height, duration, setProgress, controller.signal)
      if (!controller.signal.aborted) setResult({ url: URL.createObjectURL(blob), size: blob.size })
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'The GIF could not render. Try again.')
    } finally {
      abort.current = null
      setExporting(false)
    }
  }

  async function copyLink(): Promise<void> {
    const url = new URL(window.location.href)
    url.search = ''
    url.hash = new URLSearchParams({ to: normalizedAddress, scene: choice, shape, duration: String(duration), energy: String(energy) }).toString()
    try {
      await navigator.clipboard.writeText(url.href)
      setCopied(true)
    } catch {
      setError('The browser blocked clipboard access. Allow it, then try again.')
    }
  }

  const filename = `what-the-fuck-is-up-${normalizedAddress.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'everyone'}.gif`

  return <>
    <header className="site-header">
      <a className="brand" href={window.location.pathname} aria-label="What the fuck is up home"><span className="brand-mark">!</span><span>WTF IS UP<span className="brand-dot">.</span></span></a>
      <span className="local-badge"><span />Made in your browser</span>
    </header>
    <main>
      <section className="intro" aria-labelledby="page-title">
        <div><p className="eyebrow"><span className="tiny-star">✳</span> The unofficial Denny's GIF maker</p><h1 id="page-title">What the fuck<br />is up, <span className="highlight">your world?</span></h1><p className="intro-copy">Name a place or a group. Give them their own GIF.</p></div>
        <div className="intro-sticker" aria-hidden="true"><span>THE ORIGINAL</span><strong>DINER</strong><span>SHOW</span><svg viewBox="0 0 70 30"><path d="m2 17 8-9 9 15 9-19 8 23 8-19 8 13 8-13 8 10" /></svg></div>
      </section>
      <div className="studio">
        <section className="preview-section" aria-labelledby="preview-title">
          <div className="section-bar"><h2 id="preview-title"><span>01 /</span> The preview</h2><span className="match-tag"><span style={{ background: scene.color }} />{photo ? 'Your photo' : scene.id === 'diner' && mediaStatus === 'ready' ? 'Original footage' : `${scene.name} scene`}</span></div>
          <div className="preview-shell">
            <div className="preview-screen" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
              <canvas ref={canvas} width={size.width} height={size.height} role="img" aria-label={`Animated GIF preview: What the fuck is up, ${normalizedAddress || "Denny's"}?`} />
              <span className="preview-label"><span className={paused ? '' : 'live-dot'} />{paused ? 'Paused' : 'Preview'}</span>
              {exporting && <div className="render-overlay"><span className="render-spinner" /><strong>Making your GIF</strong><span>{progress}% complete</span><progress value={progress} max={100} aria-label="GIF export progress" /><button className="cancel-button" onClick={() => abort.current?.abort()}>Cancel</button></div>}
            </div>
            <div className="preview-toolbar"><div><button className="icon-button" aria-label={paused ? 'Play preview' : 'Pause preview'} disabled={exporting} onClick={() => setPaused(!paused)}><Icon name={paused ? 'play' : 'pause'} size={16} /></button><span className="technical">{duration}s loop <span> / </span> {size.width} × {size.height}</span></div><span className="silent-label"><Icon name="sound" size={15} />GIFs have no sound</span></div>
          </div>
          <div className="under-preview"><span className="small-star">✳</span><p>Your caption. An animated scene. A GIF to share.</p></div>
          <fieldset className="scene-section" disabled={busy}>
            <legend>Choose a scene</legend>
            <div className="scene-heading"><p>Auto matches a few keywords. You can change the scene.</p><button className={`auto-button ${choice === 'auto' && !photo ? 'active' : ''}`} aria-pressed={choice === 'auto' && !photo} onClick={() => { setChoice('auto'); setPhoto(null) }}><span>✦</span> Auto match</button></div>
            <div className="scene-grid">{scenes.map((candidate) => <SceneCard key={candidate.id} scene={candidate} selected={!photo && scene.id === candidate.id} onSelect={() => { setChoice(candidate.id); setPhoto(null) }} />)}</div>
            {choice === 'auto' && !matchScene(address).matched && !photo && <p className="hint match-note">No keyword match. Using a crowd scene. Choose another scene or add a photo for a closer match.</p>}
          </fieldset>
        </section>
        <section className="controls-panel" aria-labelledby="controls-title">
          <div className="section-bar"><h2 id="controls-title"><span>02 /</span> Make it yours</h2><span className="control-spark">✳</span></div>
          <form onSubmit={(event) => { event.preventDefault(); void makeGif() }}>
            <fieldset disabled={busy}>
              <label className="field-label" htmlFor="address">Who are we shouting at?</label><p className="caption-prefix">What the fuck is up,</p>
              <div className="address-input"><input id="address" value={address} maxLength={60} placeholder="Denny's" autoComplete="off" spellCheck={false} onChange={(event) => setAddress(event.target.value)} /><span>?</span></div>
              <div className="input-note"><span>A place, a person, your entire group chat.</span><span>{Array.from(address).length}/60</span></div>
              <div className="examples"><span>Try</span>{['the office', 'Tokyo', 'the group chat'].map((example) => <button key={example} type="button" onClick={() => { setAddress(example); setChoice('auto'); setPhoto(null) }}>{example}<span>↗</span></button>)}</div>
              <div className="field-divider" />
              <div className="field-heading"><label className="field-label" htmlFor="energy">Set the energy</label><span className="value-tag">{energy === 0.5 ? 'Low' : energy === 1 ? 'Diner level' : 'High'}</span></div>
              <input id="energy" className="energy-slider" type="range" min="0" max="2" step="1" value={energy === 0.5 ? 0 : energy === 1 ? 1 : 2} aria-valuetext={energy === 0.5 ? 'Low' : energy === 1 ? 'Diner level' : 'High'} onChange={(event) => setEnergy([0.5, 1, 2][Number(event.target.value)])} />
              <div className="range-labels"><span>A little movement</span><span>A lot of movement</span></div>
              <div className="field-label spaced" id="shape-label">GIF shape</div>
              <div className="segmented" role="group" aria-labelledby="shape-label">{([['classic', '4:3', 'Classic'], ['square', '1:1', 'Square'], ['wide', '16:9', 'Wide']] as const).map(([value, ratio, label]) => <button type="button" key={value} aria-pressed={shape === value} className={shape === value ? 'active' : ''} onClick={() => setShape(value)}><span className={`ratio-icon ${value}`} /><strong>{ratio}</strong><small>{label}</small></button>)}</div>
              <div className="duration-row"><label className="field-label" htmlFor="duration">Loop length</label><select id="duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))}><option value={2}>2 seconds</option><option value={3}>3 seconds</option><option value={4}>4 seconds</option></select></div>
              <div className={`photo-box ${photo ? 'has-photo' : ''}`}>
                <button className="photo-button" type="button" onClick={() => upload.current?.click()}><Icon name="upload" /><span><strong>{loadingPhoto ? 'Opening your photo…' : photo ? 'Change your photo' : 'Use your own photo'}</strong><small>{photo ? photoName : 'Add a face or a place. It stays on your device.'}</small></span><span>+</span></button>
                <input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void selectPhoto(event)} aria-label="Choose a photo" />
                {photo && <button className="remove-photo" type="button" onClick={() => { setPhoto(null); setPhotoName('') }}>Remove photo</button>}
              </div>
            </fieldset>
            {mediaStatus === 'fallback' && scene.id === 'diner' && !photo && <p className="hint" role="status">The original clip could not load. Using an illustrated diner instead.</p>}
            {mediaStatus === 'loading' && scene.id === 'diner' && !photo && <p className="hint" role="status">Loading the original clip…</p>}
            {error && <p className="error" role="alert">{error}</p>}
            <button className="make-button" type="submit" disabled={busy || !normalizedAddress || (scene.id === 'diner' && !photo && mediaStatus === 'loading')}><span>{exporting ? `Making GIF · ${progress}%` : 'Make my GIF'}</span>{exporting ? <span className="button-spinner" /> : <Icon name="arrow" size={22} />}</button>
            <p className="privacy-note">No account. No watermark. Your photos stay here.</p>
          </form>
          {result && <div className="result" role="status"><div className="result-heading"><Icon name="check" /><strong>Your GIF is ready</strong><span>{(result.size / 1024 / 1024).toFixed(1)} MB</span></div><img src={result.url} alt={`Finished GIF: What the fuck is up, ${normalizedAddress}?`} /><a className="download-button" href={result.url} download={filename}><Icon name="download" />Download GIF</a></div>}
          <button className="share-button" type="button" disabled={busy || !normalizedAddress || Boolean(photo)} onClick={() => void copyLink()}><Icon name={copied ? 'check' : 'link'} size={16} />{copied ? 'Link copied' : 'Copy a link to this setup'}</button>
          {photo && <p className="hint center">Download the GIF to share your photo version.</p>}
          <div className="sr-only" aria-live="polite">{exporting ? `Making GIF: ${progress}%` : copied ? 'Setup link copied' : ''}</div>
        </section>
      </div>
      <section className="quick-starts" aria-labelledby="quick-title"><div><p className="eyebrow">Need a starting point?</p><h2 id="quick-title">Try another scene.</h2></div><div className="quick-grid">{[
        { text: 'the all-hands', sub: 'For your coworkers', to: 'the office', color: '#dbe9dd' },
        { text: 'outer space', sub: 'For the other life forms', to: 'outer space', color: '#e2dcf0' },
        { text: 'leg day', sub: 'For the gym crew', to: 'leg day', color: '#e8edcb' },
      ].map((example) => <button style={{ background: example.color }} key={example.to} disabled={busy} onClick={() => { setAddress(example.to); setChoice('auto'); setPhoto(null); document.getElementById('preview-title')?.scrollIntoView({ behavior: paused ? 'instant' : 'smooth', block: 'start' }) }}><small>{example.sub}</small><strong>{example.text}<Icon name="arrow" size={22} /></strong></button>)}</div></section>
    </main>
    <footer><a className="footer-brand" href={window.location.pathname}>WTF IS UP.</a><p>Inspired by <a href="https://www.youtube.com/watch?v=9t1aUWlT1TI" target="_blank" rel="noreferrer">the original Denny's show ↗</a><br />Clip via <a href="https://imgflip.com/memetemplate/477170333/Dennys" target="_blank" rel="noreferrer">Imgflip</a>. Not affiliated with Denny's.</p><span>Made for sharing.</span></footer>
  </>
}
