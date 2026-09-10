import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { activeStatuses, type GenerationRequest, type VideoJob } from '../shared/generation.ts'
import { endpoints, type VideoProvider } from './provider.ts'
import { RequestError, validId } from './validation.ts'

interface StoredJob extends VideoJob { owner: string; endpoint: string; videoUrl?: string; observed?: boolean }
export type GenerationObserver = (job: VideoJob, model: string, owner: string) => void

function errorStatus(error: unknown): number {
  return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 0
}

export class JobStore {
  directory: string
  provider: VideoProvider
  dailyLimit: number
  jobs = new Map<string, StoredJob>()
  timers = new Set<ReturnType<typeof setTimeout>>()
  polling = new Set<string>()
  closing = false
  observe: GenerationObserver
  archive: (id: string, url: string) => Promise<unknown>

  constructor(directory: string, provider: VideoProvider, dailyLimit: number, archive: (id: string, url: string) => Promise<unknown>, observe: GenerationObserver = () => {}) {
    this.directory = directory
    this.provider = provider
    this.dailyLimit = dailyLimit
    this.observe = observe
    this.archive = archive
  }

  async save(job: StoredJob): Promise<void> {
    job.updatedAt = new Date().toISOString()
    const path = join(this.directory, `${job.id}.json`)
    await writeFile(`${path}.tmp`, JSON.stringify(job), { mode: 0o600 })
    await rename(`${path}.tmp`, path)
  }

  view(job: StoredJob): VideoJob {
    const { owner, endpoint, videoUrl, observed, ...visible } = job
    return visible
  }

  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    for (const name of await readdir(this.directory)) {
      if (!name.endsWith('.json') || !validId(name.slice(0, -5))) continue
      const job = JSON.parse(await readFile(join(this.directory, name), 'utf8')) as StoredJob
      if (!validId(job.id) || !Object.values(endpoints).includes(job.endpoint as typeof endpoints.text) || typeof job.owner !== 'string') throw new Error('A saved job is invalid. Restore the .data folder before starting the server.')
      this.jobs.set(job.id, job)
      if (activeStatuses.includes(job.status)) {
        if (!job.requestId) {
          job.status = 'uncertain'
          job.error = 'The server stopped during submission. Check your fal.ai request history before creating another video.'
          await this.save(job)
        } else this.schedule(job)
      }
    }
  }

  list(owner: string): VideoJob[] {
    return [...this.jobs.values()].filter(job => job.owner === owner).sort((first, second) => second.createdAt.localeCompare(first.createdAt)).slice(0, 30).map(job => this.view(job))
  }

  get(id: string, owner: string): StoredJob {
    const job = this.jobs.get(id)
    if (!job || job.owner !== owner) throw new RequestError(404, 'This video was not found in your browser session.')
    return job
  }

  async submit(input: GenerationRequest, owner: string): Promise<VideoJob> {
    if (this.jobs.has(input.id)) return this.view(this.get(input.id, owner))
    const active = [...this.jobs.values()].filter(job => activeStatuses.includes(job.status))
    if (active.length >= 2 || active.some(job => job.owner === owner)) throw new RequestError(429, 'Wait for the current video before starting another one.')
    const today = new Date().toISOString().slice(0, 10)
    if ([...this.jobs.values()].filter(job => job.createdAt.startsWith(today)).length >= this.dailyLimit) throw new RequestError(429, 'The daily generation limit was reached. Try tomorrow or change FAL_DAILY_LIMIT in .env.')
    const { id, referenceImage, referenceConsent, paidConsent, ...settings } = input
    const job: StoredJob = {
      id, owner, settings, hasReference: Boolean(referenceImage), status: 'submitting',
      endpoint: referenceImage ? endpoints.image : endpoints.text,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }
    this.jobs.set(id, job)
    try { await this.save(job) } catch (error) { this.jobs.delete(id); throw error }
    void this.send(job, input).catch(() => console.error(JSON.stringify({ event: 'generation_save_failed', jobId: job.id })))
    return this.view(job)
  }

  async finish(job: StoredJob): Promise<void> {
    await this.save(job)
    if (!job.observed) {
      this.observe(this.view(job), job.endpoint, job.owner)
      job.observed = true
      await this.save(job)
    }
  }

  async send(job: StoredJob, input: GenerationRequest): Promise<void> {
    try {
      job.requestId = await this.provider.submit(job.endpoint, input)
      job.status = 'queued'
      await this.save(job)
      this.schedule(job)
    } catch (error) {
      const status = errorStatus(error)
      job.status = status >= 400 && status < 500 ? 'failed' : 'uncertain'
      job.error = job.status === 'uncertain'
        ? 'Submission could not be confirmed. Check fal.ai request history before starting another video. Do not submit again yet.'
        : status === 401 || status === 403 ? 'fal.ai rejected the key. Check FAL_KEY, then restart the server.'
          : status === 402 ? 'fal.ai needs more credits. Add credits to your account, then try again.'
            : 'fal.ai rejected this request. Check the prompt, image, account credits, and provider request history.'
      await this.finish(job)
    }
  }

  schedule(job: StoredJob, delay = 4000): void {
    if (this.closing) return
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      void this.poll(job).catch(() => {
        console.error(JSON.stringify({ event: 'generation_poll_failed', jobId: job.id }))
        this.schedule(job, 15000)
      })
    }, delay)
    timer.unref()
    this.timers.add(timer)
  }

  async poll(job: StoredJob): Promise<void> {
    if (!job.requestId || this.polling.has(job.id) || this.closing || !activeStatuses.includes(job.status)) return
    this.polling.add(job.id)
    try {
      if (Date.now() - Date.parse(job.createdAt) > 60 * 60 * 1000) {
        job.status = 'uncertain'
        job.error = 'This request is taking longer than expected. Check fal.ai request history before creating another video.'
        await this.finish(job)
        return
      }
      const state = await this.provider.status(job.endpoint, job.requestId)
      if (state.status === 'COMPLETED') {
        const result = await this.provider.result(job.endpoint, job.requestId)
        const url = new URL(result.url)
        if (url.protocol !== 'https:' || url.port || url.username || url.password || !(url.hostname === 'fal.media' || url.hostname.endsWith('.fal.media'))) throw new RequestError(502, 'The provider returned an unsupported video host. Check the result in fal.ai.')
        await this.archive(job.id, result.url)
        job.videoUrl = result.url
        job.seed = result.seed
        job.status = 'ready'
        job.queuePosition = undefined
        job.error = undefined
        await this.finish(job)
        return
      }
      if (!['IN_QUEUE', 'IN_PROGRESS'].includes(state.status)) throw new RequestError(502, 'The provider returned an unknown job state. Check the request in fal.ai.')
      job.status = state.status === 'IN_QUEUE' ? 'queued' : 'generating'
      job.queuePosition = state.queuePosition
      job.error = undefined
      await this.save(job)
      this.schedule(job)
    } catch (error) {
      if (error instanceof RequestError || [400, 404, 410, 422].includes(errorStatus(error))) {
        job.status = 'failed'
        job.error = error instanceof RequestError ? error.message : 'The provider could not complete this video. Check the request in fal.ai, then revise the prompt or reference.'
        await this.finish(job)
      } else if (Date.now() - Date.parse(job.createdAt) > 60 * 60 * 1000) {
        job.status = 'uncertain'
        job.error = 'This request is taking longer than expected. Check fal.ai request history before creating another video.'
        await this.finish(job)
      } else {
        job.error = 'Waiting for a provider status update. Your request will not be submitted again.'
        await this.save(job)
        this.schedule(job, 15000)
      }
    } finally { this.polling.delete(job.id) }
  }

  close(): void { this.closing = true; for (const timer of this.timers) clearTimeout(timer) }
}

export function sessionHash(value: string): string { return createHash('sha256').update(value).digest('hex') }
