import { createFalClient } from '@fal-ai/client'
import { buildPrompt, type GenerationRequest } from '../shared/generation.ts'

export const endpoints = { text: 'fal-ai/wan-25-preview/text-to-video', image: 'fal-ai/wan-25-preview/image-to-video' } as const

export interface VideoProvider {
  submit: (endpoint: string, input: GenerationRequest) => Promise<string>
  status: (endpoint: string, requestId: string) => Promise<{ status: string; queuePosition?: number }>
  result: (endpoint: string, requestId: string) => Promise<{ url: string; seed?: number }>
}

export function createVideoProvider(key: string): VideoProvider {
  const fal = createFalClient({
    credentials: key, retry: { maxRetries: 0 },
    fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(45000) }),
  })
  return {
    async submit(endpoint, input) {
      const submitted = await fal.queue.submit(endpoint, { input: {
        prompt: buildPrompt(input), duration: input.duration, resolution: input.resolution,
        negative_prompt: input.negativePrompt, enable_prompt_expansion: input.expandPrompt, enable_safety_checker: true,
        ...(input.seed !== null ? { seed: input.seed } : {}),
        ...(input.referenceImage ? { image_url: input.referenceImage } : { aspect_ratio: input.aspectRatio }),
      } })
      if (!submitted.request_id) throw new Error('The provider did not return a request ID.')
      return submitted.request_id
    },
    async status(endpoint, requestId) {
      const result = await fal.queue.status(endpoint, { requestId, logs: false })
      return { status: result.status, queuePosition: result.status === 'IN_QUEUE' ? result.queue_position : undefined }
    },
    async result(endpoint, requestId) {
      const result = await fal.queue.result(endpoint, { requestId })
      const data = result.data as { video?: { url?: string }; seed?: number }
      if (typeof data.video?.url !== 'string') throw new Error('The provider did not return a video.')
      return { url: data.video.url, seed: data.seed }
    },
  }
}
