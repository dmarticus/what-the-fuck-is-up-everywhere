import type { SceneId } from './scenes'

export interface RenderOptions {
  address: string
  scene: SceneId
  energy: number
  seed: number
  photo: HTMLImageElement | null
  video: HTMLVideoElement | null
  captions?: boolean
  useVideo?: boolean
  startTime?: number
  frameRate?: number
  captionColor?: string
  captionPosition?: 'top' | 'bottom'
}

function rectangle(context: CanvasRenderingContext2D, color: string, left: number, top: number, width: number, height: number): void {
  context.fillStyle = color
  context.fillRect(left, top, width, height)
}

function line(context: CanvasRenderingContext2D, color: string, width: number, points: number[][]): void {
  context.beginPath()
  context.strokeStyle = color
  context.lineWidth = width
  context.lineCap = 'round'
  context.lineJoin = 'round'
  points.forEach(([left, top], index) => index === 0 ? context.moveTo(left, top) : context.lineTo(left, top))
  context.stroke()
}

function label(context: CanvasRenderingContext2D, text: string, left: number, top: number, size: number, color = '#f4edcf'): void {
  context.fillStyle = color
  context.font = `900 ${size}px monospace`
  context.textAlign = 'center'
  context.fillText(text, left, top)
}

function person(context: CanvasRenderingContext2D, left: number, top: number, scale: number, phase: number, color: string, singer = false): void {
  context.save()
  context.translate(left, top + Math.sin(phase) * 5)
  context.rotate(Math.sin(phase * 0.7) * 0.12)
  context.scale(scale, scale)
  line(context, '#171b22', 12, [[-7, 12], [-12 - Math.sin(phase) * 6, 37]])
  line(context, '#171b22', 12, [[7, 12], [17 + Math.sin(phase) * 6, 37]])
  rectangle(context, color, -15, -27, 30, 46)
  const skin = '#d8aa84'
  line(context, color, 10, [[-13, -20], [-28, -26], [-33, -42 - Math.cos(phase) * 11]])
  line(context, color, 10, [[13, -20], [27, -34], [singer ? 12 : 35, -46 + Math.sin(phase) * 10]])
  context.fillStyle = skin
  context.beginPath()
  context.arc(0, -41, 13, 0, Math.PI * 2)
  context.fill()
  rectangle(context, '#222127', -13, -54, 26, 9)
  if (singer) {
    line(context, '#15191e', 5, [[13, -43], [25, -45]])
    line(context, '#15191e', 1, [[25, -45], [32, -5], [20, 40], [70, 47]])
  }
  context.restore()
}

function backdrop(context: CanvasRenderingContext2D, scene: SceneId, phase: number): void {
  const sky = context.createLinearGradient(0, 0, 0, 240)
  const colors: Record<SceneId, [string, string]> = {
    diner: ['#594033', '#b28b5e'], office: ['#405f59', '#9aafa0'], city: ['#4b354f', '#e39570'],
    gym: ['#354840', '#839466'], space: ['#141a39', '#5d4a85'], crowd: ['#36213d', '#9e5062'], chat: ['#353157', '#9278af'],
  }
  sky.addColorStop(0, colors[scene][0])
  sky.addColorStop(1, colors[scene][1])
  context.fillStyle = sky
  context.fillRect(0, 0, 320, 240)

  if (scene === 'diner') {
    rectangle(context, '#d0b792', 0, 54, 320, 7)
    for (let column = 0; column < 4; column++) {
      rectangle(context, '#201f22', column * 90 + 6, 70, 75, 66)
      rectangle(context, '#5d7679', column * 90 + 10, 74, 67, 57)
      rectangle(context, '#d0b792', column * 90 + 41, 74, 3, 57)
    }
    rectangle(context, '#7c3433', 0, 142, 320, 32)
    for (let row = 0; row < 5; row++) {
      for (let column = 0; column < 12; column++) {
        rectangle(context, (row + column) % 2 ? '#777162' : '#b4ad8e', column * 30 - 20, 174 + row * 15, 30, 15)
      }
    }
    label(context, 'OPEN 24 HOURS', 160, 47, 16, '#ffda85')
  } else if (scene === 'office') {
    for (let column = 0; column < 4; column++) {
      rectangle(context, '#b6d4c2', 12 + column * 79, 38, 63, 85)
      rectangle(context, '#5a7c78', 42 + column * 79, 38, 3, 85)
      rectangle(context, '#5a7c78', 12 + column * 79, 79, 63, 3)
    }
    rectangle(context, '#3e5148', 0, 158, 320, 82)
    for (let desk = 0; desk < 3; desk++) {
      rectangle(context, '#293439', 26 + desk * 110, 121, 45, 32)
      rectangle(context, '#9cdf97', 30 + desk * 110, 125, 37, 24)
      rectangle(context, '#dfc5a1', 9 + desk * 110, 159, 79, 7)
      rectangle(context, '#343c3d', 14 + desk * 110, 166, 5, 54)
    }
    label(context, 'ALL-HANDS', 160, 26, 12)
  } else if (scene === 'city') {
    context.fillStyle = '#f7bc86'
    context.beginPath()
    context.arc(254, 66, 33, 0, Math.PI * 2)
    context.fill()
    for (let building = 0; building < 10; building++) {
      const height = 50 + (building * 37) % 90
      rectangle(context, building % 2 ? '#423d52' : '#323a4a', building * 35 - 10, 175 - height, 32, height)
      for (let floor = 0; floor < height / 15 - 1; floor++) {
        rectangle(context, '#e8b779', building * 35 - 3, 184 - height + floor * 15, 5, 6)
        rectangle(context, '#b3b8b1', building * 35 + 10, 184 - height + floor * 15, 5, 6)
      }
    }
    rectangle(context, '#393d48', 0, 176, 320, 64)
    for (let stripe = 0; stripe < 7; stripe++) rectangle(context, '#cbb895', stripe * 55, 222, 28, 3)
  } else if (scene === 'gym') {
    rectangle(context, '#b6c1a0', 19, 39, 282, 100)
    rectangle(context, '#536961', 159, 39, 3, 100)
    rectangle(context, '#303d36', 0, 171, 320, 69)
    for (let rack = 0; rack < 2; rack++) {
      const left = 30 + rack * 230
      line(context, '#222c2d', 5, [[left, 180], [left, 80], [left + 28, 80], [left + 28, 180]])
      line(context, '#cad0bd', 4, [[left - 13, 106], [left + 40, 106]])
      rectangle(context, '#252e30', left - 8, 92, 10, 29)
      rectangle(context, '#252e30', left + 26, 92, 10, 29)
    }
    label(context, 'ONE MORE REP', 160, 28, 13)
  } else if (scene === 'space') {
    for (let star = 0; star < 70; star++) {
      context.globalAlpha = 0.5 + Math.sin(phase + star) * 0.4
      rectangle(context, '#fff6dd', (star * 73) % 320, (star * 41) % 181, star % 3 ? 1 : 2, 2)
    }
    context.globalAlpha = 1
    context.fillStyle = '#dba782'
    context.beginPath()
    context.arc(254, 74, 30, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = '#b88caf'
    context.lineWidth = 8
    context.beginPath()
    context.ellipse(254, 74, 48, 10, -0.4, 0, Math.PI * 2)
    context.stroke()
    context.fillStyle = '#797488'
    context.beginPath()
    context.ellipse(160, 267, 230, 99, 0, 0, Math.PI * 2)
    context.fill()
    label(context, 'LIVE FROM ORBIT', 85, 45, 9)
  } else if (scene === 'chat') {
    for (let bubble = 0; bubble < 5; bubble++) {
      const left = bubble % 2 ? 122 : 19
      const top = 30 + bubble * 28 + Math.sin(phase + bubble) * 3
      context.fillStyle = bubble % 2 ? '#afa4de' : '#e1d8f0'
      context.beginPath()
      context.roundRect(left, top, 170, 23, 7)
      context.fill()
      label(context, ['who is awake', 'WE ARE HERE', 'turn it up', 'this is the one', 'everybody get in'][bubble], left + 85, top + 15, 9, '#3b3454')
    }
    rectangle(context, '#37314e', 0, 185, 320, 55)
  } else {
    for (let beam = 0; beam < 4; beam++) {
      context.fillStyle = beam % 2 ? '#d7956638' : '#bfa6e338'
      context.beginPath()
      context.moveTo(beam * 95 + 15, 0)
      context.lineTo(beam * 95 - 45 + Math.sin(phase) * 20, 205)
      context.lineTo(beam * 95 + 105, 205)
      context.fill()
    }
    rectangle(context, '#352337', 0, 176, 320, 64)
    for (const left of [12, 263]) {
      rectangle(context, '#211d29', left, 93, 45, 85)
      context.strokeStyle = '#655267'
      context.lineWidth = 3
      for (const top of [114, 151]) {
        context.beginPath()
        context.arc(left + 22, top, 15, 0, Math.PI * 2)
        context.stroke()
      }
    }
    label(context, 'EVERYBODY IN', 160, 54, 17)
  }
}

function cover(context: CanvasRenderingContext2D, source: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number): void {
  const scale = Math.max(width / sourceWidth, height / sourceHeight)
  context.drawImage(source, (width - sourceWidth * scale) / 2, (height - sourceHeight * scale) / 2, sourceWidth * scale, sourceHeight * scale)
}

function caption(context: CanvasRenderingContext2D, text: string, center: number, baseline: number, maxWidth: number, size: number, color: string): void {
  context.font = `900 ${size}px Impact, 'Arial Black', sans-serif`
  while (context.measureText(text).width > maxWidth && size > 10) {
    size -= 1
    context.font = `900 ${size}px Impact, 'Arial Black', sans-serif`
  }
  context.textAlign = 'center'
  context.lineJoin = 'round'
  context.strokeStyle = '#151714'
  context.lineWidth = Math.max(3, size / 9)
  context.strokeText(text, center, baseline)
  context.fillStyle = color
  context.fillText(text, center, baseline)
}

export function drawCaptions(context: CanvasRenderingContext2D, width: number, height: number, options: Pick<RenderOptions, 'address' | 'captionColor' | 'captionPosition'>): void {
  context.save()
  const atTop = options.captionPosition === 'top'
  const shade = context.createLinearGradient(0, atTop ? height * 0.4 : height * 0.6, 0, atTop ? 0 : height)
  shade.addColorStop(0, 'transparent')
  shade.addColorStop(1, '#10100ee0')
  context.fillStyle = shade
  context.fillRect(0, atTop ? 0 : height * 0.6, width, height * 0.4)
  caption(context, 'WHAT THE FUCK IS UP,', width / 2, atTop ? 55 : height - 80, width - 38, 46, '#fffdf2')
  caption(context, `${(options.address || 'DENNY’S').toLocaleUpperCase()}?`, width / 2, atTop ? 111 : height - 24, width - 38, 64, options.captionColor ?? '#e6ff58')
  context.restore()
}

export function drawScene(context: CanvasRenderingContext2D, width: number, height: number, time: number, options: RenderOptions): void {
  const phase = time * Math.PI * 2 * options.energy
  context.save()
  context.clearRect(0, 0, width, height)
  if (options.photo) {
    context.save()
    context.translate(width / 2, height / 2)
    context.rotate(Math.sin(phase) * 0.013 * options.energy)
    const zoom = 1.07 + Math.sin(phase / 2) * 0.02
    context.scale(zoom, zoom)
    context.translate(-width / 2, -height / 2)
    cover(context, options.photo, options.photo.naturalWidth, options.photo.naturalHeight, width, height)
    context.restore()
  } else if ((options.scene === 'diner' || options.useVideo) && options.video && options.video.readyState >= 2) {
    cover(context, options.video, options.video.videoWidth, options.video.videoHeight, width, height)
  } else {
    context.save()
    context.scale(width / 320, height / 240)
    backdrop(context, options.scene, phase)
    const shirts = options.scene === 'space' ? ['#dfdfd5', '#d9cbaf', '#cbd5d0'] : ['#242a33', '#d6cab1', '#9d5349', '#556e74', '#a19bb0']
    for (let dancer = 0; dancer < 9; dancer++) {
      const left = ((dancer * 51 + options.seed * 13) % 355) - 15
      const top = 159 + (dancer % 3) * 17
      person(context, left, top, 0.65 + (dancer % 3) * 0.14, phase + dancer * 1.3, shirts[dancer % shirts.length])
    }
    person(context, 162, 173, 1.28, phase, options.scene === 'space' ? '#f3f0d8' : '#23262b', true)
    context.restore()
  }
  if (options.captions !== false) {
    drawCaptions(context, width, height, options)
  }
  context.restore()
}
