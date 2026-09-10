export async function readReference(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Choose a JPG, PNG, or WebP image under 10 MB.')
  const source = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = source
    await image.decode()
    if (image.naturalWidth * image.naturalHeight > 24_000_000) throw new Error('Choose an image under 24 megapixels.')
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
    canvas.width = Math.round(image.naturalWidth * scale)
    canvas.height = Math.round(image.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.9)
  } finally { URL.revokeObjectURL(source) }
}

export async function cropReference(source: string, ratio: string): Promise<string> {
  const image = new Image()
  image.src = source
  await image.decode()
  const [width, height] = ratio.split(':').map(Number)
  const canvas = document.createElement('canvas')
  canvas.width = width >= height ? 1280 : Math.round(1280 * width / height)
  canvas.height = height >= width ? 1280 : Math.round(1280 * height / width)
  const context = canvas.getContext('2d')!
  const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
  context.fillStyle = '#111'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, (canvas.width - image.naturalWidth * scale) / 2, (canvas.height - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale)
  const result = canvas.toDataURL('image/jpeg', 0.88)
  if (result.length > 4_000_000) throw new Error('The cropped reference is too large. Choose a simpler image.')
  return result
}
