import { spawn } from 'node:child_process'

const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env', 'server/index.ts'], { stdio: 'inherit' }),
  spawn(process.execPath, ['--env-file-if-exists=.env', 'node_modules/vite/bin/vite.js', ...process.argv.slice(2)], { stdio: 'inherit' }),
]
let closing = false
function stop(code = 0) {
  if (closing) return
  closing = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 3000).unref()
  Promise.all(children.map(child => new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve)))).then(() => process.exit(code))
}
for (const child of children) {
  child.once('error', error => { console.error(error.message); stop(1) })
  child.once('exit', code => { if (!closing) stop(code ?? 1) })
}
process.once('SIGINT', () => stop())
process.once('SIGTERM', () => stop())
