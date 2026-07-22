/* ================================================================
   OSGARD · Docker Codegen
   ----------------------------------------------------------------
   Чистая (без сети/файловой системы) генерация Dockerfile и
   docker-compose.yml для сгенерированного проекта. Multi-stage сборка
   для nextjs/node, статика — через nginx.

   Пример вызова:
     const dockerfile = generateDockerfile({ name: "my-app", framework: "nextjs" })
     const compose = generateDockerCompose({ name: "my-app", port: 3000 })
   ================================================================ */

export type ProjectInfo = {
  name: string
  framework?: "nextjs" | "node" | "static" | "react" | "python"
  nodeVersion?: string
  pythonVersion?: string
  port?: number
  installCommand?: string
  buildCommand?: string
  startCommand?: string
}

export function generateDockerfile(projectInfo: ProjectInfo): string {
  const {
    framework = "nextjs",
    nodeVersion = "20",
    pythonVersion = "3.12",
    port = 3000,
    installCommand = "npm ci",
    buildCommand = "npm run build",
    startCommand = "npm run start",
  } = projectInfo

  if (framework === "static" || framework === "react") {
    return [
      `FROM node:${nodeVersion}-alpine AS build`,
      "WORKDIR /app",
      "COPY package*.json ./",
      `RUN ${installCommand}`,
      "COPY . .",
      `RUN ${buildCommand}`,
      "",
      "FROM nginx:alpine",
      `COPY --from=build /app/${framework === "react" ? "dist" : "out"} /usr/share/nginx/html`,
      "EXPOSE 80",
      'CMD ["nginx", "-g", "daemon off;"]',
      "",
    ].join("\n")
  }

  if (framework === "python") {
    return [
      `FROM python:${pythonVersion}-slim`,
      "WORKDIR /app",
      "COPY requirements.txt ./",
      "RUN pip install --no-cache-dir -r requirements.txt",
      "COPY . .",
      `EXPOSE ${port}`,
      `CMD ${JSON.stringify(startCommand.split(" "))}`,
      "",
    ].join("\n")
  }

  return [
    `FROM node:${nodeVersion}-alpine AS base`,
    "WORKDIR /app",
    "",
    "FROM base AS deps",
    "COPY package*.json ./",
    `RUN ${installCommand}`,
    "",
    "FROM base AS build",
    "COPY --from=deps /app/node_modules ./node_modules",
    "COPY . .",
    `RUN ${buildCommand}`,
    "",
    "FROM base AS runtime",
    'ENV NODE_ENV="production"',
    "COPY --from=deps /app/node_modules ./node_modules",
    "COPY --from=build /app ./",
    `EXPOSE ${port}`,
    `CMD ${JSON.stringify(startCommand.split(" "))}`,
    "",
  ].join("\n")
}

export function generateDockerCompose(projectInfo: ProjectInfo): string {
  const { name, port = 3000 } = projectInfo

  return [
    "services:",
    `  ${name}:`,
    "    build: .",
    "    ports:",
    `      - "${port}:${port}"`,
    "    environment:",
    "      - NODE_ENV=production",
    "    restart: unless-stopped",
    "",
  ].join("\n")
}
