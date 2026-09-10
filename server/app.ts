import { randomUUID, timingSafeEqual } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, stat, unlink } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { JobStore, sessionHash, type GenerationObserver } from './jobs.ts'
import { type VideoProvider } from './provider.ts'
import { RequestError, validateRequest, validId } from './validation.ts'

const contentTypes: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.png': 'image/png', '.woff2': 'font/woff2' }

function respond(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(data))
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new RequestError(415, 'Use a JSON request.')
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > 4_100_000) throw new RequestError(413, 'The request is too large. Choose a smaller reference image.')
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new RequestError(400, 'The request contains invalid JSON.') }
}

async function serveFile(path: string, request: IncomingMessage, response: ServerResponse, download = false): Promise<void> {
  const file = await stat(path).catch(() => { throw new RequestError(404, 'The file was not found. Build the app or try again.') })
  if (!file.isFile()) throw new RequestError(404, 'The file was not found.')
  let start = 0
  let end = file.size - 1
  const headers: Record<string, string | number> = { 'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store' }
  if (download) headers['Content-Disposition'] = 'attachment; filename="what-is-up-video.mp4"'
  if (request.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range)
    if (!match || (!match[1] && !match[2])) throw new RequestError(416, 'The requested video range is invalid.')
    start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]))
    end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end
    if (start > end || start >= file.size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      response.setHeader('Content-Range', `bytes */${file.size}`)
      throw new RequestError(416, 'The requested video range is outside this file.')
    }
    headers['Content-Range'] = `bytes ${start}-${end}/${file.size}`
  }
  headers['Content-Length'] = end - start + 1
  response.writeHead(request.headers.range ? 206 : 200, headers)
  if (request.method === 'HEAD') { response.end(); return }
  await pipeline(createReadStream(path, { start, end }), response)
}

export async function createApp(options: { provider: VideoProvider; configured: boolean; dataDirectory: string; staticDirectory: string; dailyLimit: number; observe?: GenerationObserver }): Promise<{ server: ReturnType<typeof createServer>; store: JobStore }> {
  const downloads = new Map<string, Promise<string>>()
  const download = async (id: string, url: string): Promise<string> => {
    const path = join(options.dataDirectory, `${id}.mp4`)
    if (await stat(path).catch(() => null)) return path
    if (downloads.has(id)) return downloads.get(id)!
    const pending = (async (): Promise<string> => {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120000) })
      if (!response.ok || !response.body) throw new Error('The video download is not available yet.')
      if (!response.headers.get('content-type')?.startsWith('video/')) throw new RequestError(502, 'The generated file is not a video. Check the request in fal.ai.')
      if (Number(response.headers.get('content-length')) > 100_000_000) throw new RequestError(502, 'The generated video is too large to download here.')
      let bytes = 0
      const limit = new Transform({ transform(chunk, encoding, callback) {
        bytes += chunk.length
        callback(bytes > 100_000_000 ? new Error('Video size limit reached') : null, chunk)
      } })
      await mkdir(dirname(path), { recursive: true, mode: 0o700 })
      try {
        await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), limit, createWriteStream(`${path}.tmp`, { mode: 0o600 }))
        if (bytes < 100) throw new Error('The downloaded video is empty.')
        await rename(`${path}.tmp`, path)
        return path
      } catch (error) { await unlink(`${path}.tmp`).catch(() => {}); throw error }
    })()
    downloads.set(id, pending)
    try { return await pending } finally { downloads.delete(id) }
  }
  const store = new JobStore(options.dataDirectory, options.provider, options.dailyLimit, download, options.observe)
  await store.initialize()
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    try {
      const host = request.headers.host ?? ''
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) throw new RequestError(403, 'This personal server only accepts localhost requests.')
      const url = new URL(request.url ?? '/', `http://${host}`)
      if (request.headers.origin && request.headers.origin !== `http://${host}`) throw new RequestError(403, 'Cross-origin requests are not allowed.')
      const sessionCookie = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('wtf_session='))?.slice(12)
      const session = sessionCookie && validId(sessionCookie) ? sessionCookie : randomUUID()
      if (session !== sessionCookie) response.setHeader('Set-Cookie', `wtf_session=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`)
      const owner = sessionHash(session)
      if (url.pathname.startsWith('/api/')) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          const csrf = request.headers['x-csrf-token']
          if (typeof csrf !== 'string' || Buffer.byteLength(csrf) !== Buffer.byteLength(owner) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(owner))) throw new RequestError(403, 'The browser session expired. Reload before generating a video.')
        }
        if (url.pathname === '/api/config' && request.method === 'GET') { respond(response, 200, { configured: options.configured, csrfToken: owner, dailyLimit: options.dailyLimit, model: 'Wan 2.5', provider: 'fal.ai' }); return }
        if (url.pathname === '/api/jobs' && request.method === 'GET') { respond(response, 200, { jobs: store.list(owner) }); return }
        if (url.pathname === '/api/jobs' && request.method === 'POST') {
          if (!options.configured) throw new RequestError(503, 'Add FAL_KEY to .env and restart the server to generate AI video.')
          respond(response, 202, await store.submit(validateRequest(await readBody(request)), owner)); return
        }
        const videoRoute = /^\/api\/jobs\/([0-9a-f-]+)\/video$/.exec(url.pathname)
        if (videoRoute && validId(videoRoute[1]) && ['GET', 'HEAD'].includes(request.method ?? '')) {
          const job = store.get(videoRoute[1], owner)
          if (job.status !== 'ready' || !job.videoUrl) throw new RequestError(409, 'The video is not ready yet.')
          await serveFile(await download(job.id, job.videoUrl), request, response, url.searchParams.has('download')); return
        }
        throw new RequestError(404, 'This API route does not exist.')
      }
      if (!['GET', 'HEAD'].includes(request.method ?? '')) throw new RequestError(405, 'This request method is not supported.')
      const root = resolve(options.staticDirectory)
      const path = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`)
      if (!path.startsWith(`${root}${sep}`)) throw new RequestError(403, 'This path is not available.')
      await serveFile(path, request, response)
    } catch (error) {
      if (response.headersSent) { response.destroy(); return }
      const status = error instanceof RequestError ? error.status : 500
      if (status === 500) console.error(JSON.stringify({ event: 'api_request_failed', method: request.method, status }))
      respond(response, status, { error: error instanceof RequestError ? error.message : 'The server could not complete this request. Check the server terminal and try again.' })
    }
  })
  server.requestTimeout = 30000
  server.on('close', () => store.close())
  return { server, store }
}
