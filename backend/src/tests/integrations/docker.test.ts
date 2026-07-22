import { test } from "node:test"
import assert from "node:assert/strict"
import { generateDockerfile, generateDockerCompose } from "../../services/integrations/docker"

test("generateDockerfile: nextjs — multi-stage сборка", () => {
  const dockerfile = generateDockerfile({ name: "app", framework: "nextjs" })
  assert.match(dockerfile, /FROM node:20-alpine AS base/)
  assert.match(dockerfile, /RUN npm ci/)
  assert.match(dockerfile, /RUN npm run build/)
  assert.match(dockerfile, /EXPOSE 3000/)
})

test("generateDockerfile: static — сборка + nginx, /app/out", () => {
  const dockerfile = generateDockerfile({ name: "app", framework: "static" })
  assert.match(dockerfile, /FROM nginx:alpine/)
  assert.match(dockerfile, /COPY --from=build \/app\/out \/usr\/share\/nginx\/html/)
})

test("generateDockerfile: react — сборка + nginx, /app/dist", () => {
  const dockerfile = generateDockerfile({ name: "app", framework: "react" })
  assert.match(dockerfile, /FROM nginx:alpine/)
  assert.match(dockerfile, /COPY --from=build \/app\/dist \/usr\/share\/nginx\/html/)
})

test("generateDockerfile: python — pip install, без сборочного стейджа", () => {
  const dockerfile = generateDockerfile({ name: "app", framework: "python", pythonVersion: "3.11", port: 8000 })
  assert.match(dockerfile, /FROM python:3\.11-slim/)
  assert.match(dockerfile, /RUN pip install --no-cache-dir -r requirements\.txt/)
  assert.match(dockerfile, /EXPOSE 8000/)
})

test("generateDockerCompose: подставляет имя и порт сервиса", () => {
  const compose = generateDockerCompose({ name: "my-app", port: 4000 })
  assert.match(compose, /my-app:/)
  assert.match(compose, /"4000:4000"/)
})
