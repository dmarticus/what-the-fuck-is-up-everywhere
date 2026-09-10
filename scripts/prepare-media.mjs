import { mkdir, stat, writeFile } from 'node:fs/promises'

const destination = new URL('../public/media/original.mp4', import.meta.url)
try {
  await stat(destination)
} catch {
  try {
    const response = await fetch('https://i.imgflip.com/7w3ezh.mp4', {
      signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) throw new Error(`Source returned ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length > 10_000_000 || !response.headers.get('content-type')?.includes('video/')) {
      throw new Error('The source did not return the expected video')
    }
    await mkdir(new URL('../public/media/', import.meta.url), { recursive: true })
    await writeFile(destination, bytes)
  } catch (error) {
    console.warn('Original clip unavailable. The app will use the illustrated diner.', error.message)
  }
}
