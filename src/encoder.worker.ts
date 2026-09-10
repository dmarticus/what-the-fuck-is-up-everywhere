import { GIFEncoder, applyPalette, quantize } from 'gifenc'

const encoder = GIFEncoder()

self.onmessage = (event: MessageEvent<{ pixels?: ArrayBuffer; width: number; height: number; delay: number; finish?: boolean }>): void => {
  try {
    if (event.data.finish) {
      encoder.finish()
      const bytes = encoder.bytes()
      const output = new Uint8Array(bytes).buffer
      self.postMessage({ type: 'done', bytes: output }, { transfer: [output] })
      return
    }
    const { pixels, width, height, delay } = event.data
    if (!pixels) throw new Error('Missing frame')
    const rgba = new Uint8Array(pixels)
    const palette = quantize(rgba, 128)
    encoder.writeFrame(applyPalette(rgba, palette), width, height, { palette, delay, repeat: 0 })
    self.postMessage({ type: 'frame' })
  } catch {
    self.postMessage({ type: 'error' })
  }
}
