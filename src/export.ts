import { drawScene, type RenderOptions } from './render'

function seekVideo(video: HTMLVideoElement, time: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Canceled', 'AbortError'))
    if (Math.abs(video.currentTime - time) < 0.005 && video.readyState >= 2) return resolve()
    const cleanup = (): void => {
      clearTimeout(timeout)
      video.removeEventListener('seeked', done)
      video.removeEventListener('error', failed)
      signal.removeEventListener('abort', canceled)
    }
    const done = (): void => { cleanup(); resolve() }
    const failed = (): void => { cleanup(); reject(new Error('The clip could not load. Reload the video or choose another clip.')) }
    const canceled = (): void => { cleanup(); reject(new DOMException('Canceled', 'AbortError')) }
    const timeout = setTimeout(failed, 10000)
    video.addEventListener('seeked', done, { once: true })
    video.addEventListener('error', failed, { once: true })
    signal.addEventListener('abort', canceled, { once: true })
    video.currentTime = time
  })
}

export async function exportGif(options: RenderOptions, width: number, height: number, duration: number, onProgress: (percent: number) => void, signal: AbortSignal): Promise<Blob> {
  const worker = new Worker(new URL('./encoder.worker.ts', import.meta.url), { type: 'module' })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  const video = !options.photo && (options.scene === 'diner' || options.useVideo) ? options.video : null
  const fps = options.frameRate ?? 12
  const frames = Math.max(1, Math.round(duration * fps))
  const exchange = (message: object, transfer: Transferable[] = []): Promise<{ bytes?: ArrayBuffer }> => new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Canceled', 'AbortError'))
    const cleanup = (): void => {
      clearTimeout(timeout)
      worker.onmessage = null
      worker.onerror = null
      signal.removeEventListener('abort', canceled)
    }
    const failed = (): void => { cleanup(); reject(new Error('The GIF could not render. Try a shorter loop.')) }
    const canceled = (): void => { cleanup(); reject(new DOMException('Canceled', 'AbortError')) }
    const timeout = setTimeout(failed, 30000)
    worker.onmessage = (event): void => {
      if (event.data.type === 'error') return failed()
      cleanup()
      resolve(event.data)
    }
    worker.onerror = failed
    signal.addEventListener('abort', canceled, { once: true })
    worker.postMessage(message, transfer)
  })
  try {
    video?.pause()
    for (let frame = 0; frame < frames; frame++) {
      if (signal.aborted) throw new DOMException('Canceled', 'AbortError')
      if (video && Number.isFinite(video.duration)) {
        const time = options.startTime !== undefined
          ? Math.min(options.startTime + (frame / fps) * options.energy, Math.max(0, video.duration - 0.02))
          : ((frame / fps) * options.energy) % video.duration
        await seekVideo(video, time, signal)
      }
      drawScene(context, width, height, frame / fps, options)
      const pixels = context.getImageData(0, 0, width, height).data.buffer
      const delay = (Math.round((frame + 1) * 100 / fps) - Math.round(frame * 100 / fps)) * 10
      await exchange({ pixels, width, height, delay }, [pixels])
      onProgress(Math.round(((frame + 1) / frames) * 100))
    }
    const result = await exchange({ finish: true })
    if (!result.bytes) throw new Error('The GIF is empty. Try again.')
    return new Blob([result.bytes], { type: 'image/gif' })
  } finally {
    worker.terminate()
  }
}
