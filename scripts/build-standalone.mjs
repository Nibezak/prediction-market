import { spawn } from 'node:child_process'

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

if (process.env.NEXT_RUN_BUILD_TSC === 'true') {
  await run('npx', ['tsc', '--noEmit', '--pretty', 'false', '--skipLibCheck'])
}

await run('npx', ['next', 'build'], {
  env: {
    ...process.env,
    NEXT_SKIP_BUILD_TYPECHECK: 'true',
  },
})
