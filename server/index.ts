import { resolve } from 'node:path'
import { PostHog } from 'posthog-node'
import { createApp } from './app.ts'
import { createVideoProvider } from './provider.ts'

const key = process.env.FAL_KEY?.trim() ?? ''
const dailyLimit = Number(process.env.FAL_DAILY_LIMIT ?? 10)
const port = Number(process.env.API_PORT ?? 5181)
if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100 || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Check API_PORT and FAL_DAILY_LIMIT in .env.')
const analytics = process.env.POSTHOG_API_KEY && process.env.POSTHOG_HOST
  ? new PostHog(process.env.POSTHOG_API_KEY, { host: process.env.POSTHOG_HOST, disableGeoip: true }) : null
const { server } = await createApp({
  provider: createVideoProvider(key), configured: Boolean(key), dailyLimit,
  dataDirectory: resolve('.data'), staticDirectory: resolve('dist'),
  observe(job, model, owner) {
    console.info(JSON.stringify({ event: 'video_generation_finished', jobId: job.id, status: job.status }))
    analytics?.capture({ distinctId: owner, event: '$ai_generation', properties: {
      $ai_trace_id: job.id, $ai_session_id: null, $ai_model: model, $ai_provider: 'fal',
      $ai_span_name: 'video_generation', $ai_latency: (Date.parse(job.updatedAt) - Date.parse(job.createdAt)) / 1000,
      $ai_is_error: job.status !== 'ready', requested_duration_seconds: Number(job.settings.duration),
      resolution: job.settings.resolution, has_reference_image: job.hasReference,
    } })
  },
})
server.on('error', error => { console.error(`Could not start the video server: ${error.message}`); process.exit(1) })
server.listen(port, '127.0.0.1', () => console.info(`Video API: http://localhost:${port} (${key ? 'fal.ai key configured' : 'add FAL_KEY to .env for AI generation'})`))
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  server.close(() => { void analytics?.shutdown().finally(() => process.exit(0)); if (!analytics) process.exit(0) })
  setTimeout(() => process.exit(0), 5000).unref()
})
