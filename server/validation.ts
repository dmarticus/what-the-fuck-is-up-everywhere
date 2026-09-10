import { buildPrompt, cameras, looks, type GenerationRequest, type GenerationSettings } from '../shared/generation.ts'

export class RequestError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export const validId = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

function text(value: unknown, name: string, maximum: number, required = true): string {
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim())) throw new RequestError(400, `${name} must contain ${required ? '1' : '0'} to ${maximum} characters.`)
  return value.trim()
}

function choice<Value extends string>(value: unknown, choices: readonly Value[], name: string): Value {
  if (typeof value !== 'string' || !choices.includes(value as Value)) throw new RequestError(400, `Choose a supported ${name}.`)
  return value as Value
}

export function validateRequest(raw: unknown): GenerationRequest {
  if (!raw || typeof raw !== 'object') throw new RequestError(400, 'Send a generation request as JSON.')
  const input = raw as Record<string, unknown>
  if (typeof input.id !== 'string' || !validId(input.id)) throw new RequestError(400, 'The generation ID is invalid. Reload the page.')
  if (input.paidConsent !== true) throw new RequestError(400, 'Confirm that this generation uses your fal.ai credits.')
  if (input.seed !== null && (!Number.isInteger(input.seed) || Number(input.seed) < 0 || Number(input.seed) > 2147483647)) throw new RequestError(400, 'Use a seed from 0 to 2147483647, or leave it empty.')
  if (typeof input.expandPrompt !== 'boolean') throw new RequestError(400, 'Choose whether fal.ai can expand the prompt.')
  const settings: GenerationSettings = {
    address: text(input.address, 'The caption target', 60), brief: text(input.brief, 'The scene description', 900),
    look: choice(input.look, Object.keys(looks) as (keyof typeof looks)[], 'look'),
    camera: choice(input.camera, Object.keys(cameras) as (keyof typeof cameras)[], 'camera motion'),
    duration: choice(input.duration, ['5', '10'], 'duration'), resolution: choice(input.resolution, ['480p', '720p', '1080p'], 'resolution'),
    aspectRatio: choice(input.aspectRatio, ['16:9', '1:1', '9:16'], 'aspect ratio'),
    negativePrompt: text(input.negativePrompt, 'The negative prompt', 500, false), seed: input.seed as number | null, expandPrompt: input.expandPrompt,
  }
  if (buildPrompt(settings).length > 1500) throw new RequestError(400, 'The complete prompt is too long. Shorten the scene description.')
  let referenceImage: string | undefined
  if (input.referenceImage !== undefined) {
    if (input.referenceConsent !== true) throw new RequestError(400, 'Confirm that you can use the reference image and send it to fal.ai.')
    if (typeof input.referenceImage !== 'string' || input.referenceImage.length > 4_000_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.referenceImage)) throw new RequestError(400, 'Choose a smaller JPG, PNG, or WebP reference image.')
    const bytes = Buffer.from(input.referenceImage.split(',')[1], 'base64')
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new RequestError(400, 'The reference image could not be read.')
    referenceImage = input.referenceImage
  }
  return { ...settings, id: input.id, paidConsent: true, referenceConsent: input.referenceConsent === true, referenceImage }
}
