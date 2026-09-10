import { useCallback, useEffect, useRef, useState } from 'react'
import type { GenerationRequest, VideoJob } from '../../shared/generation'

interface ServerConfig { configured: boolean; csrfToken: string; dailyLimit: number; model: string; provider: string }

export function useVideoJobs() {
  const [config, setConfig] = useState<ServerConfig | null>(null)
  const [jobs, setJobs] = useState<VideoJob[]>([])
  const [connectionError, setConnectionError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    const refresh = async (): Promise<void> => {
      try {
        const setup = await fetch('/api/config', { signal: controller.signal })
        if (!setup.ok) throw new Error()
        const configuration = await setup.json() as ServerConfig
        const response = await fetch('/api/jobs', { signal: controller.signal })
        if (!response.ok) throw new Error()
        const history = await response.json() as { jobs: VideoJob[] }
        if (!mounted.current || controller.signal.aborted) return
        setConfig(configuration)
        setJobs(history.jobs)
        setConnectionError('')
      } catch {
        if (!controller.signal.aborted && mounted.current) setConnectionError('The video server is not connected. Run npm run dev from the project folder, then keep this page open.')
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), 4000)
      }
    }
    void refresh()
    return (): void => { mounted.current = false; controller.abort(); clearTimeout(timer) }
  }, [])

  const submit = useCallback(async (input: GenerationRequest): Promise<VideoJob> => {
    if (inFlight.current) throw new Error('A submission is already in progress.')
    if (!config) throw new Error('Wait for the video server to connect.')
    inFlight.current = true
    setSubmitting(true)
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': config.csrfToken },
        body: JSON.stringify(input), signal: AbortSignal.timeout(60000),
      })
      const data = await response.json() as VideoJob & { error?: string }
      if (!response.ok) throw new Error(data.error || 'The server rejected this generation.')
      if (mounted.current) setJobs(previous => [data, ...previous.filter(job => job.id !== data.id)])
      return data
    } catch (error) {
      if (error instanceof TypeError || error instanceof DOMException) throw new Error('The response was lost. Wait for history to refresh. Retry submission uses the same ID and will not create a second request.')
      throw error
    } finally {
      inFlight.current = false
      if (mounted.current) setSubmitting(false)
    }
  }, [config])
  return { config, jobs, connectionError, submitting, submit }
}
