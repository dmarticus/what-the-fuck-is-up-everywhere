import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from 'react'
import { activeStatuses, buildPrompt, cameras, defaultSettings, looks, type GenerationRequest, type GenerationSettings, type VideoJob } from '../../shared/generation'
import { exportGif } from '../export'
import { cleanAddress } from '../scenes'
import { cropReference, readReference } from './media'
import { useVideoJobs } from './useVideoJobs'
import { CaptionOverlay } from './CaptionOverlay'

const presets = [
  { name: 'Tokyo ramen shop', address: 'Tokyo', brief: defaultSettings.brief, icon: '🍜', look: 'live' },
  { name: 'Moon base', address: 'the moon', brief: 'Astronauts in a moon-base cafeteria start a low-gravity mosh pit. A singer holds a microphone. Earth is visible through a large window. Food packets float past the camera.', icon: '☾', look: 'cinema' },
  { name: 'Office all-hands', address: 'the office', brief: 'An ordinary office all-hands turns into a tiny punk show. A coworker grabs the presentation microphone. Colleagues jump between desks while the video call watches in surprise.', icon: '▤', look: 'live' },
  { name: 'Tiny clay band', address: 'my little guys', brief: 'A tiny handmade clay band performs in a miniature kitchen. Clay friends jump between oversized mugs. The singer climbs onto a biscuit and raises a tiny microphone.', icon: '✿', look: 'clay' },
] as const

const statusLabels: Record<VideoJob['status'], string> = {
  submitting: 'Submitting', queued: 'In the queue', generating: 'Generating video', ready: 'Ready', failed: 'Generation failed', uncertain: 'Check fal.ai',
}

export function VideoStudio(): ReactElement {
  const { config, jobs, connectionError, submitting, submit } = useVideoJobs()
  const [settings, setSettings] = useState<GenerationSettings>(defaultSettings)
  const [reference, setReference] = useState<string | null>(null)
  const [referenceConsent, setReferenceConsent] = useState(false)
  const [paidConsent, setPaidConsent] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [localClip, setLocalClip] = useState<{ url: string; name: string } | null>(null)
  const [caption, setCaption] = useState(defaultSettings.address)
  const [captionEnabled, setCaptionEnabled] = useState(true)
  const [captionPosition, setCaptionPosition] = useState<'top' | 'bottom'>('bottom')
  const [captionColor, setCaptionColor] = useState('#e6ff58')
  const [start, setStart] = useState(0)
  const [length, setLength] = useState(3)
  const [speed, setSpeed] = useState(1)
  const [fps, setFps] = useState(12)
  const [outputWidth, setOutputWidth] = useState(480)
  const [mediaDuration, setMediaDuration] = useState(0)
  const [mediaRatio, setMediaRatio] = useState(16 / 9)
  const [mediaReady, setMediaReady] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [gif, setGif] = useState<{ url: string; size: number } | null>(null)
  const [retrySubmission, setRetrySubmission] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const attempt = useRef<GenerationRequest | null>(null)
  const preparingRef = useRef(false)
  const mounted = useRef(true)
  const video = useRef<HTMLVideoElement>(null)
  const abort = useRef<AbortController | null>(null)
  const referenceInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const activeJob = jobs.find(job => activeStatuses.includes(job.status))
  const selected = jobs.find(job => job.id === selectedId) ?? jobs[0]
  const source = localClip?.url ?? (selected?.status === 'ready' ? `/api/jobs/${selected.id}/video` : '')
  const clipLength = Math.min(length, Math.max(0.25, mediaDuration - start))
  const busy = preparing || submitting || exporting
  const generationDisabled = busy || Boolean(activeJob) || !config?.configured || Boolean(connectionError) || !settings.brief.trim() || !settings.address.trim() || !paidConsent || (Boolean(reference) && !referenceConsent)
  const gifWidth = Math.max(1, Math.min(outputWidth, Math.round(960 * mediaRatio)))
  const outputHeight = Math.max(1, Math.round(gifWidth / mediaRatio))

  useEffect(() => {
    mounted.current = true
    return (): void => { mounted.current = false; abort.current?.abort() }
  }, [])
  useEffect(() => () => { if (localClip) URL.revokeObjectURL(localClip.url) }, [localClip])
  useEffect(() => () => { if (gif) URL.revokeObjectURL(gif.url) }, [gif])
  useEffect(() => {
    setMediaReady(false); setMediaError(''); setMediaDuration(0); setStart(0); setLength(3); setGif(null)
  }, [source])
  useEffect(() => { setGif(null) }, [caption, captionEnabled, captionPosition, captionColor, start, length, speed, fps, outputWidth])
  useEffect(() => {
    if (video.current) video.current.playbackRate = speed
  }, [speed, source, mediaReady])
  useEffect(() => {
    if (!activeJob) return
    const tick = (): void => setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(activeJob.createdAt)) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return (): void => clearInterval(timer)
  }, [activeJob?.id])
  useEffect(() => {
    if (attempt.current && jobs.some(job => job.id === attempt.current?.id)) {
      attempt.current = null
      setRetrySubmission(false)
    }
  }, [jobs])

  function update<Key extends keyof GenerationSettings>(key: Key, value: GenerationSettings[Key]): void {
    setSettings(previous => ({ ...previous, [key]: value }))
    if (key === 'address') setCaption(String(value))
    setError('')
  }

  async function selectReference(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || preparingRef.current || busy) return
    preparingRef.current = true
    setPreparing(true); setError('')
    try {
      const source = await readReference(file)
      if (mounted.current) { setReference(source); setReferenceConsent(false) }
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'This reference image could not load. Choose another image.')
    } finally { preparingRef.current = false; if (mounted.current) setPreparing(false) }
  }

  function selectVideo(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return
    if (!['video/mp4', 'video/webm'].includes(file.type) || file.size > 60 * 1024 * 1024) {
      setError('Choose an MP4 or WebM video under 60 MB and 60 seconds.'); return
    }
    setLocalClip({ url: URL.createObjectURL(file), name: file.name })
    setError('')
  }

  async function generate(): Promise<void> {
    if (generationDisabled || preparingRef.current) return
    preparingRef.current = true
    setPreparing(true); setError('')
    try {
      if (!attempt.current) {
        const image = reference ? await cropReference(reference, settings.aspectRatio) : undefined
        if (!mounted.current) return
        attempt.current = { ...settings, id: crypto.randomUUID(), paidConsent, referenceConsent, referenceImage: image }
      }
      const submitted = await submit(attempt.current)
      if (!mounted.current) return
      setSelectedId(submitted.id); setLocalClip(null); setCaption(submitted.settings.address)
      attempt.current = null; setRetrySubmission(false)
    } catch (failure) {
      if (!mounted.current) return
      const message = failure instanceof Error ? failure.message : 'The video could not be submitted. Try again.'
      setError(message)
      const uncertain = message.startsWith('The response was lost.')
      setRetrySubmission(uncertain)
      if (!uncertain) attempt.current = null
    } finally { preparingRef.current = false; if (mounted.current) setPreparing(false) }
  }

  function chooseJob(job: VideoJob): void {
    if (busy) return
    setSelectedId(job.id); setLocalClip(null); setCaption(job.settings.address); setError('')
  }

  async function makeGif(): Promise<void> {
    if (!video.current || !mediaReady || abort.current || busy) return
    const controller = new AbortController()
    abort.current = controller
    setExporting(true); setProgress(0); setGif(null); setError('')
    try {
      const output = await exportGif({
        scene: 'diner', address: cleanAddress(caption), video: video.current, photo: null, seed: 0,
        useVideo: true, startTime: start, energy: speed, frameRate: fps, captions: captionEnabled,
        captionPosition, captionColor,
      }, gifWidth, outputHeight, clipLength / speed, setProgress, controller.signal)
      if (mounted.current && !controller.signal.aborted) setGif({ url: URL.createObjectURL(output), size: output.size })
    } catch (failure) {
      if (mounted.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'The GIF could not render. Try a shorter clip.')
    } finally { abort.current = null; if (mounted.current) setExporting(false) }
  }

  const filename = `what-is-up-${cleanAddress(caption).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60) || 'everyone'}.gif`

  return <main className="ai-studio">
    <header className="ai-intro"><div><p className="ai-eyebrow"><span>✦</span> A scene from your imagination</p><h1>What the fuck is up,<br /><em>anywhere?</em></h1><p>Describe the scene. Generate the video. Make the GIF.</p></div><div className="ai-model-stamp"><span>POWERED BY</span><strong>fal.ai</strong><span>WAN 2.5 · VIDEO GENERATION</span></div></header>

    <div className="ai-workspace">
      <section className="ai-controls" aria-labelledby="generate-title">
        <div className="ai-section-title"><h2 id="generate-title">01 <span>Build the scene</span></h2><span className="ai-model-chip">Wan 2.5</span></div>
        <form onSubmit={event => { event.preventDefault(); void generate() }}>
          <fieldset disabled={busy || retrySubmission}>
            <label htmlFor="ai-address">Who are we shouting at?</label>
            <div className="ai-address"><span>↗</span><input id="ai-address" value={settings.address} onChange={event => update('address', event.target.value)} maxLength={60} placeholder="A place, a person, your group chat" /></div>
            <label className="ai-field-space" htmlFor="ai-brief">What happens in the video?</label>
            <textarea id="ai-brief" value={settings.brief} onChange={event => update('brief', event.target.value)} maxLength={900} rows={5} />
            <div className="ai-input-help"><span>Describe the action, people, and setting.</span><span>{settings.brief.length}/900</span></div>
            <div className="ai-preset-row">{presets.map(preset => <button type="button" key={preset.name} onClick={() => { setSettings(previous => ({ ...previous, address: preset.address, brief: preset.brief, look: preset.look })); setCaption(preset.address) }}>{preset.icon} {preset.name}</button>)}</div>
            <div className="ai-reference">
              {reference ? <><img src={reference} alt="Reference image, center-cropped to the selected video shape" style={{ aspectRatio: settings.aspectRatio.replace(':', '/'), width: settings.aspectRatio === '9:16' ? 118 : settings.aspectRatio === '1:1' ? 210 : '100%', marginInline: 'auto' }} /><button type="button" className="ai-remove" onClick={() => { setReference(null); setReferenceConsent(false) }} aria-label="Remove reference image">×</button><span className="ai-reference-label">First frame · center crop</span></> : <button className="ai-reference-button" type="button" onClick={() => referenceInput.current?.click()}><span className="ai-upload-icon">↥</span><strong>Add a reference image</strong><span>Use your own face, place, or starting frame.</span><small>JPG, PNG, WebP · up to 10 MB</small></button>}
              <input ref={referenceInput} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Reference image" onChange={event => void selectReference(event)} />
            </div>
            {reference && <label className="ai-checkbox"><input type="checkbox" checked={referenceConsent} onChange={event => setReferenceConsent(event.target.checked)} /><span>I can use this image and send it to fal.ai.</span></label>}
            <div className="ai-fields-grid"><div><label htmlFor="ai-look">Visual style</label><select id="ai-look" value={settings.look} onChange={event => update('look', event.target.value as GenerationSettings['look'])}>{Object.entries(looks).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></div><div><label htmlFor="ai-camera">Camera motion</label><select id="ai-camera" value={settings.camera} onChange={event => update('camera', event.target.value as GenerationSettings['camera'])}>{Object.entries(cameras).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></div></div>
            <label className="ai-field-space" id="ai-ratio-label">Video shape</label><div className="ai-segments" role="group" aria-labelledby="ai-ratio-label">{(['16:9', '1:1', '9:16'] as const).map(ratio => <button key={ratio} type="button" aria-pressed={settings.aspectRatio === ratio} onClick={() => update('aspectRatio', ratio)}><span className={`ai-ratio ${ratio === '9:16' ? 'portrait' : ratio === '1:1' ? 'square' : ''}`} />{ratio}<small>{ratio === '16:9' ? 'Landscape' : ratio === '1:1' ? 'Square' : 'Portrait'}</small></button>)}</div>
            <div className="ai-fields-grid"><div><label htmlFor="ai-duration">Video length</label><select id="ai-duration" value={settings.duration} onChange={event => update('duration', event.target.value as GenerationSettings['duration'])}><option value="5">5 seconds</option><option value="10">10 seconds</option></select></div><div><label htmlFor="ai-resolution">Resolution</label><select id="ai-resolution" value={settings.resolution} onChange={event => update('resolution', event.target.value as GenerationSettings['resolution'])}><option value="480p">480p · lower cost</option><option value="720p">720p · balanced</option><option value="1080p">1080p · more detail</option></select></div></div>
            <details className="ai-advanced"><summary>Advanced settings <span>+</span></summary><label htmlFor="ai-negative">What should the model avoid?</label><textarea id="ai-negative" rows={3} maxLength={500} value={settings.negativePrompt} onChange={event => update('negativePrompt', event.target.value)} /><label htmlFor="ai-seed">Seed <small>Leave empty for a new variation</small></label><input id="ai-seed" type="number" min={0} max={2147483647} step={1} value={settings.seed ?? ''} onChange={event => update('seed', event.target.value === '' ? null : Number(event.target.value))} /><label className="ai-checkbox"><input type="checkbox" checked={settings.expandPrompt} onChange={event => update('expandPrompt', event.target.checked)} /><span>Let fal.ai expand the prompt for more detail.</span></label><details className="ai-prompt-preview"><summary>See the complete prompt</summary><p>{buildPrompt(settings)}</p></details></details>
          </fieldset>
          {connectionError && <p className="ai-notice warning" role="status">{connectionError}</p>}
          {!connectionError && config && !config.configured && <div className="ai-notice"><strong>Connect fal.ai to generate video</strong><p>Add your key to <code>.env</code> as <code>FAL_KEY=...</code>, then restart <code>npm run dev</code>.</p><a href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer">Get a fal.ai key ↗</a></div>}
          <label className="ai-checkbox ai-paid"><input type="checkbox" checked={paidConsent} disabled={busy || retrySubmission} onChange={event => setPaidConsent(event.target.checked)} /><span>I understand that generation uses my fal.ai credits.</span></label>
          <button className="ai-generate" type="submit" disabled={generationDisabled}><span>{preparing ? 'Preparing request…' : submitting ? 'Submitting…' : activeJob ? statusLabels[activeJob.status] : retrySubmission ? 'Retry the same submission' : `Generate ${settings.duration}s video`}</span><span>{busy || activeJob ? '◌' : '✦'}</span></button>
          <p className="ai-billing">Paid generation · {config?.dailyLimit ?? 10} requests per day by default.<br />Prompts and reference images are sent to fal.ai. <a href="https://fal.ai/models/fal-ai/wan-25-preview/text-to-video" target="_blank" rel="noreferrer">See model pricing ↗</a></p>
        </form>
      </section>

      <div className="ai-output-column">
        <section className="ai-output" aria-labelledby="output-title">
          <div className="ai-section-title"><h2 id="output-title">02 <span>Preview & export</span></h2><button className="ai-text-button" disabled={busy} onClick={() => videoInput.current?.click()}>↥ Open a local video</button><input ref={videoInput} hidden type="file" accept="video/mp4,video/webm" aria-label="Local video" onChange={selectVideo} /></div>
          <div className={`ai-preview ${source ? 'has-video' : ''}`} style={source ? { maxWidth: mediaRatio * 540, marginInline: 'auto' } : undefined}>
            {source ? <>
              <video ref={video} key={source} src={source} controls={!exporting} playsInline muted preload="auto" onLoadedData={() => {
                const element = video.current
                if (!element) return
                if (!Number.isFinite(element.duration) || element.duration < 0.25 || element.duration > 60) { setMediaError('Use a video between 0.25 and 60 seconds long.'); return }
                const ratio = element.videoWidth / element.videoHeight
                if (!Number.isFinite(ratio) || ratio < 0.2 || ratio > 5) { setMediaError('Use a video with a standard landscape, square, or portrait shape.'); return }
                setMediaDuration(element.duration); setMediaRatio(ratio); setMediaReady(true)
              }} onError={() => { setMediaReady(false); setMediaError('This video could not load. Try opening it again from history or choose a different local video.') }} onTimeUpdate={() => {
                if (video.current && !exporting && !video.current.paused && video.current.currentTime >= start + clipLength) video.current.currentTime = start
              }} onPlay={() => { if (video.current && video.current.currentTime < start) video.current.currentTime = start }} />
              {captionEnabled && <CaptionOverlay width={gifWidth} height={outputHeight} address={cleanAddress(caption)} color={captionColor} position={captionPosition} />}
              <span className="ai-footage-label">{localClip ? 'LOCAL VIDEO' : 'AI GENERATED'}</span>
              {exporting && <div className="ai-export-overlay"><span className="ai-orbit" /><strong>Rendering your GIF</strong><progress value={progress} max={100} aria-label="GIF export progress" /><span>{progress}% · stays in your browser</span><button onClick={() => abort.current?.abort()}>Cancel export</button></div>}
            </> : <div className="ai-empty-stage"><div className="ai-stage-grid" /><div className="ai-stage-symbol">✦</div><span className="ai-frame-corner top-left" /><span className="ai-frame-corner top-right" /><span className="ai-frame-corner bottom-left" /><span className="ai-frame-corner bottom-right" />{activeJob ? <><span className="ai-empty-kicker">FAL.AI / WAN 2.5</span><h3>{statusLabels[activeJob.status]}</h3><p>{activeJob.queuePosition !== undefined ? `Queue position ${activeJob.queuePosition}. ` : ''}{Math.floor(elapsed / 60)}m {elapsed % 60}s elapsed</p><small>Keep the server running. You can return to this page later.</small></> : <><span className="ai-empty-kicker">YOUR NEXT SCENE</span><h3>From a prompt<br />to a full video.</h3><p>Generate a scene on the left, or open a video<br />from your device to try the editor.</p><button disabled={busy} onClick={() => videoInput.current?.click()}>Open a local video ↗</button></>}</div>}
          </div>
          <div className="ai-preview-meta"><span>{source ? localClip?.name ?? `${selected?.settings.resolution} · ${selected?.settings.duration}s · Wan 2.5` : `${settings.resolution} · ${settings.duration}s · ${settings.aspectRatio}`}</span><span>{source ? 'Caption preview' : 'Real video generation, not a preset scene'}</span></div>
          {mediaError && <p className="ai-notice warning" role="alert">{mediaError}</p>}
          {selected?.error && !localClip && <p className="ai-notice warning" role="status">{selected.error}{selected.requestId && <small>Request: {selected.requestId}</small>} <a href="https://fal.ai/dashboard/requests" target="_blank" rel="noreferrer">Open fal.ai request history ↗</a></p>}

          <fieldset className="ai-edit-controls" disabled={!mediaReady || busy}>
            <div className="ai-edit-title"><h3>Make it a meme</h3><label className="ai-checkbox"><input type="checkbox" checked={captionEnabled} onChange={event => setCaptionEnabled(event.target.checked)} /><span>Show caption</span></label></div>
            <label htmlFor="ai-caption">What the fuck is up,</label><div className="ai-caption-row"><input id="ai-caption" value={caption} onChange={event => setCaption(event.target.value)} maxLength={60} /><select aria-label="Caption position" value={captionPosition} onChange={event => setCaptionPosition(event.target.value as 'top' | 'bottom')}><option value="bottom">Bottom</option><option value="top">Top</option></select><label className="ai-color-picker" title="Caption color"><input type="color" value={captionColor} onChange={event => setCaptionColor(event.target.value)} aria-label="Caption color" /></label></div>
            <div className="ai-trim-heading"><label htmlFor="ai-trim">Choose the starting point</label><span>{start.toFixed(1)}s → {(start + clipLength).toFixed(1)}s</span></div>
            <input id="ai-trim" type="range" min={0} max={Math.max(0, mediaDuration - 0.25)} step={0.1} value={start} onChange={event => { const time = Number(event.target.value); setStart(time); if (video.current) video.current.currentTime = time }} />
            <div className="ai-export-options"><div><label htmlFor="ai-loop">Clip length</label><select id="ai-loop" value={length} onChange={event => setLength(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map(value => <option value={value} key={value}>{value} seconds</option>)}</select></div><div><label htmlFor="ai-speed">Speed</label><select id="ai-speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value={0.5}>0.5× slow</option><option value={1}>1× normal</option><option value={2}>2× fast</option></select></div><div><label htmlFor="ai-size">GIF size</label><select id="ai-size" value={outputWidth} onChange={event => setOutputWidth(Number(event.target.value))}><option value={480}>480px · smaller</option><option value={640}>640px · sharper</option></select></div><div><label htmlFor="ai-fps">Frame rate</label><select id="ai-fps" value={fps} onChange={event => setFps(Number(event.target.value))}><option value={12}>12 fps</option><option value={18}>18 fps</option></select></div></div>
          </fieldset>
          {error && <p className="ai-notice warning" role="alert">{error}</p>}
          <div className="ai-export-actions"><button className="ai-gif-button" disabled={!mediaReady || busy || (captionEnabled && !cleanAddress(caption))} onClick={() => void makeGif()}>{exporting ? `Exporting · ${progress}%` : 'Export captioned GIF'} <span>↓</span></button>{source && <a className="ai-mp4-button" href={localClip ? source : `${source}?download=1`} download={localClip?.name ?? 'what-is-up-video.mp4'}>Download original video ↗</a>}</div>
          <p className="ai-export-note">GIF export is free and silent. Original video downloads do not include the caption.<br />{mediaReady ? `${gifWidth} × ${outputHeight} · ${(clipLength / speed).toFixed(1)}s at ${fps} fps.` : 'You can use a local video without a fal.ai key.'}</p>
          {gif && <div className="ai-gif-result" role="status"><img src={gif.url} alt={`Exported GIF: What the fuck is up, ${caption}?`} /><div><strong>Your GIF is ready</strong><span>{(gif.size / 1024 / 1024).toFixed(1)} MB · no watermark</span><a href={gif.url} download={filename}>Download GIF ↓</a></div></div>}
        </section>

        <section className="ai-history" aria-labelledby="history-title"><div className="ai-section-title"><h2 id="history-title">03 <span>Your generations</span></h2><span className="ai-history-count">{jobs.length} videos</span></div>{jobs.length ? <div className="ai-history-grid">{jobs.map(job => <div className={`ai-history-card ${selected?.id === job.id && !localClip ? 'selected' : ''}`} key={job.id}><button className="ai-history-select" disabled={busy} onClick={() => chooseJob(job)}><span className={`ai-history-status ${job.status}`}>{statusLabels[job.status]}</span><strong>{job.settings.address}</strong><span>{job.settings.resolution} · {job.settings.duration}s · {looks[job.settings.look]?.label}</span><small>{new Date(job.createdAt).toLocaleString()}</small></button><button className="ai-remix" disabled={busy || retrySubmission} onClick={() => { setSettings({ ...job.settings, seed: job.seed ?? job.settings.seed }); setCaption(job.settings.address); setReference(null); setReferenceConsent(false); setError(job.hasReference ? 'This video used a reference image. Add it again before generating a variation.' : ''); document.getElementById('ai-brief')?.focus() }}>Reuse settings{job.seed !== undefined ? ` · seed ${job.seed}` : ''} ↗</button></div>)}</div> : <div className="ai-history-empty"><span>▱</span><p>Your generated videos will appear here.<br /><small>Saved locally by the server, including after a page reload.</small></p></div>}</section>
      </div>
    </div>
    <footer className="ai-footer"><span>WTF IS UP. <small>From the diner to anywhere.</small></span><span>Your API key stays on the server. Reference images go to fal.ai only when you generate.</span></footer>
  </main>
}
