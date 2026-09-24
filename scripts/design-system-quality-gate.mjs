import { spawn } from "node:child_process"

const checks = [
  "scripts/design-system-a11y.mjs",
  "scripts/design-system-performance.mjs",
  "scripts/design-system-assets.mjs",
]

for (const script of checks) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: "inherit", env: process.env })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${script} failed with exit code ${code}`))
    })
  })
}

console.log("design-system:quality-gate:ok")
