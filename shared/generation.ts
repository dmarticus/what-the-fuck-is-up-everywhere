export const looks = {
  live: { label: 'Handheld show', prompt: 'Raw live-show footage, handheld camcorder, warm practical lighting, candid crowd reactions.' },
  cinema: { label: 'Cinematic', prompt: 'Cinematic live action, dramatic lighting, natural skin texture, detailed environment.' },
  anime: { label: 'Anime', prompt: 'Expressive hand-drawn anime, dynamic poses, colorful detailed backgrounds.' },
  clay: { label: 'Clay animation', prompt: 'Handmade clay characters and miniature sets, playful stop-motion animation.' },
} as const

export const cameras = {
  handheld: { label: 'Handheld', prompt: 'A wide handheld camera follows the action with gentle natural shake.' },
  push: { label: 'Slow push-in', prompt: 'The camera slowly moves toward the performer.' },
  orbit: { label: 'Orbit', prompt: 'The camera smoothly circles the performer, revealing the setting.' },
  locked: { label: 'Locked-off', prompt: 'A fixed wide camera shows the full scene with no camera movement.' },
} as const

export interface GenerationSettings {
  address: string
  brief: string
  look: keyof typeof looks
  camera: keyof typeof cameras
  duration: '5' | '10'
  resolution: '480p' | '720p' | '1080p'
  aspectRatio: '16:9' | '1:1' | '9:16'
  negativePrompt: string
  seed: number | null
  expandPrompt: boolean
}

export interface GenerationRequest extends GenerationSettings {
  id: string
  paidConsent: boolean
  referenceConsent: boolean
  referenceImage?: string
}

export type JobStatus = 'submitting' | 'queued' | 'generating' | 'ready' | 'failed' | 'uncertain'

export interface VideoJob {
  id: string
  status: JobStatus
  settings: GenerationSettings
  hasReference: boolean
  createdAt: string
  updatedAt: string
  requestId?: string
  queuePosition?: number
  seed?: number
  error?: string
}

export const activeStatuses: JobStatus[] = ['submitting', 'queued', 'generating']

export function buildPrompt(settings: GenerationSettings): string {
  return `${settings.brief.trim()} The setting or audience is ${settings.address.trim()}. ${looks[settings.look].prompt} ${cameras[settings.camera].prompt} Energetic performance inspired by a small DIY music show. No text, subtitles, logos, or watermarks. Keep the main action visible for a short meme clip.`
}

export const defaultSettings: GenerationSettings = {
  address: 'Tokyo',
  brief: 'A vocalist grabs a microphone inside a tiny Tokyo ramen shop. Friends jump up from their stools and start a small mosh pit between the tables. Bowls stay safely on the counter.',
  look: 'live', camera: 'handheld', duration: '5', resolution: '720p', aspectRatio: '16:9',
  negativePrompt: 'illegible text, subtitles, distorted faces, extra limbs, blurry image',
  seed: null, expandPrompt: true,
}
