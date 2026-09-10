import { useEffect, useRef, type ReactElement } from 'react'
import { drawCaptions } from '../render'

export function CaptionOverlay({ width, height, address, color, position }: { width: number; height: number; address: string; color: string; position: 'top' | 'bottom' }): ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, width, height)
    drawCaptions(context, width, height, { address, captionColor: color, captionPosition: position })
  }, [width, height, address, color, position])
  return <canvas className="ai-caption-overlay" ref={canvas} width={width} height={height} aria-label={`Caption: What the fuck is up, ${address}?`} role="img" />
}
