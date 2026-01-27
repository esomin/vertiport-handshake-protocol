# 모노레포 세팅 작업 기록

이 문서는 `uam-density-control` 모노레포의 초기 설정 과정을 작업 순서대로 정리한 기록입니다.

---

## 1단계: 루트 디렉토리 초기화

프로젝트 루트에서 pnpm을 패키지 매니저로 지정하여 `package.json`을 생성합니다.

```bash
pnpm init
```

생성 후 `packageManager` 필드를 명시적으로 지정하고, Turborepo 실행 스크립트를 추가합니다.

```json
// package.json
{
  "name": "uam-density-control",
  "version": "1.0.0",
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint"
  },
  "packageManager": "pnpm@10.30.1"
}
```

---

## 2단계: pnpm 워크스페이스 설정

`pnpm-workspace.yaml`을 생성하여 `apps/`와 `packages/` 하위의 모든 디렉토리를 워크스페이스 패키지로 등록합니다.

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

---

## 3단계: Turborepo 설정

Turborepo를 설치하고 `turbo.json`으로 빌드 파이프라인을 정의합니다.

```bash
pnpm add -D turbo -w
```

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

- `"dependsOn": ["^build"]`: 의존하는 패키지(`packages/*`)의 `build`가 먼저 완료된 후 빌드 실행
- `"cache": false, "persistent": true`: `dev` 태스크는 캐시하지 않고 장기 실행 프로세스로 유지

---

## 4단계: 공유 패키지(packages/) 생성

`packages/` 디렉토리 하위에 각 공유 패키지 폴더를 만들고, 각각 `package.json`과 빈 진입점 파일을 생성합니다.

### 4-1. @uam/types — 공통 타입 정의

```bash
mkdir -p packages/types
```

```json
// packages/types/package.json
{
  "name": "@uam/types",
  "version": "0.0.0",
  "main": "index.ts",
  "types": "index.ts"
}
```

```typescript
// packages/types/index.ts
export interface UamVehicleStatus {
  uamId: string;
  latitude: number;
  longitude: number;
  altitude: number;
  batteryPercent: number;
  isEmergency: boolean;
  timestamp: number;
}

export interface PriorityQueueItem extends UamVehicleStatus {
  priorityScore: number;
}
```

### 4-2. @uam/proto — gRPC 정의

```bash
mkdir -p packages/proto
```

```json
// packages/proto/package.json
{
  "name": "@uam/proto",
  "version": "0.0.0",
  "main": "index.ts",
  "types": "index.ts"
}
```

### 4-3. @uam/database — DB 클라이언트/스키마

```bash
mkdir -p packages/database
```

```json
// packages/database/package.json
{
  "name": "@uam/database",
  "version": "0.0.0",
  "main": "index.ts",
  "types": "index.ts"
}
```

### 4-4. @uam/ui — 공통 UI 컴포넌트

```bash
mkdir -p packages/ui
```

```json
// packages/ui/package.json
{
  "name": "@uam/ui",
  "version": "0.0.0",
  "main": "index.ts",
  "types": "index.ts"
}
```

### 4-5. @uam/config — 공통 ESLint/Prettier/TSConfig

```bash
mkdir -p packages/config
```

```json
// packages/config/package.json
{
  "name": "@uam/config",
  "version": "0.0.0",
  "main": "index.js"
}
```

---

## 5단계: NestJS 앱 생성 (simulator / scheduler / gateway)

NestJS CLI로 각 앱을 생성합니다. pnpm 워크스페이스 환경이므로 `--package-manager pnpm` 옵션을 사용합니다.

```bash
# apps/ 디렉토리로 이동 후 각각 생성
cd apps
npx @nestjs/cli new simulator --package-manager pnpm --skip-git
npx @nestjs/cli new scheduler --package-manager pnpm --skip-git
```

> **gateway**는 아직 NestJS 본체 의존성 없이 껍데기만 유지하고 `package.json`만 직접 작성합니다.

생성된 각 앱의 `package.json`에서 다음을 조정합니다.

- `name` 필드를 `@uam/<앱명>` 스코프 형식으로 변경
- 워크스페이스 내 공유 패키지를 `workspace:*` 프로토콜로 의존성 추가

```json
// apps/simulator/package.json (변경 사항 요약)
{
  "name": "@uam/simulator",
  "dependencies": {
    "@nestjs/microservices": "^11.1.14",
    "@uam/types": "workspace:*",
    "mqtt": "^5.15.0"
    // ... 기타 NestJS 의존성
  }
}
```

```json
// apps/scheduler/package.json (변경 사항 요약)
{
  "name": "@uam/cscheduler",
  "dependencies": {
    "@uam/types": "workspace:*"
    // ... 기타 NestJS 의존성
  }
}
```

```json
// apps/gateway/package.json
{
  "name": "@uam/gateway",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "lint": "eslint . --ext .ts"
  },
  "dependencies": {
    "@uam/types": "workspace:*"
  }
}
```

### NestJS 핵심 설정 파일 구조

각 NestJS 앱은 CLI 생성 시 아래 파일들이 자동으로 만들어집니다.

```
apps/simulator/
├── nest-cli.json          # NestJS CLI 컴파일러 설정
├── tsconfig.json          # TypeScript 설정 (target: ES2023, nodenext 모듈)
├── tsconfig.build.json    # 빌드 전용 tsconfig (test 제외)
├── eslint.config.mjs      # Flat Config 기반 ESLint (prettier 통합)
├── .prettierrc
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── app.controller.ts
    └── app.service.ts
```

```json
// nest-cli.json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

---

## 6단계: Vite + React 앱 생성 (dashboard)

Vite CLI로 React + TypeScript 템플릿을 사용해 대시보드 앱을 생성합니다.

```bash
cd apps
pnpm create vite dashboard --template react-ts
```

생성 후 `package.json`을 수정하여 스코프명과 워크스페이스 의존성을 추가합니다.

```json
// apps/dashboard/package.json
{
  "name": "@uam/dashboard",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint . --ext .ts,.tsx",
    "preview": "vite preview"
  },
  "dependencies": {
    "@uam/types": "workspace:*",
    "@uam/ui": "workspace:*",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  }
}
```

### Dashboard 핵심 설정 파일 구조

```
apps/dashboard/
├── vite.config.ts         # Vite 설정 (@vitejs/plugin-react)
├── tsconfig.json          # 루트 tsconfig (references 방식)
├── tsconfig.app.json      # 앱 소스용 (ESNext, bundler 모드, jsx: react-jsx)
├── tsconfig.node.json     # Vite 설정 파일용 (Node 환경)
├── eslint.config.js       # Flat Config (react-hooks, react-refresh 플러그인)
├── index.html
└── src/
    ├── main.tsx
    └── App.tsx
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

tsconfig는 Project References 방식으로 분리합니다.

```json
// tsconfig.json (루트 — 참조만 정의)
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

```json
// tsconfig.app.json (앱 소스 전용)
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "noEmit": true,
    "strict": true
    // ...
  },
  "include": ["src"]
}
```

---

## 7단계: 워크스페이스 전체 의존성 설치

루트로 돌아와 `pnpm install`을 실행합니다. pnpm이 `pnpm-workspace.yaml`을 읽고 모든 워크스페이스 패키지의 의존성을 한 번에 설치하며, `workspace:*` 참조는 로컬 심볼릭 링크로 연결됩니다.

```bash
cd ..  # 루트로 이동
pnpm install
```

`pnpm-lock.yaml`이 생성되며, 각 패키지 간 참조는 아래처럼 기록됩니다.

```yaml
# pnpm-lock.yaml (일부)
apps/dashboard:
  dependencies:
    '@uam/types':
      specifier: workspace:*
      version: link:../../packages/types
    '@uam/ui':
      specifier: workspace:*
      version: link:../../packages/ui
```

---

## 8단계: Docker Compose로 인프라 정의

`docker-compose.yml`을 작성하여 MQTT 브로커(Mosquitto)와 Redis를 인프라로 정의합니다.

```yaml
# docker-compose.yml
version: '3.8'

services:
  # L2: MQTT Broker
  mosquitto:
    image: eclipse-mosquitto:2.0
    container_name: uam-mqtt-broker
    ports:
      - "1883:1883"   # MQTT
      - "9001:9001"   # WebSocket
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf

  # L3: In-Memory DB (Priority Queue)
  redis:
    image: redis:7-alpine
    container_name: uam-redis
    ports:
      - "6379:6379"
```

---

## 최종 디렉토리 구조

```
uam-density-control/
├── apps/
│   ├── simulator/          # @uam/simulator  — NestJS (MQTT Client)
│   ├── gateway/            # @uam/gateway    — NestJS (MQTT Broker Interface)
│   ├── scheduler/          # @uam/cscheduler — NestJS (Redis ZSET, Logic)
│   └── dashboard/          # @uam/dashboard  — React + Vite
├── packages/
│   ├── types/              # @uam/types    — 공통 TypeScript 타입
│   ├── proto/              # @uam/proto    — gRPC .proto 정의
│   ├── database/           # @uam/database — DB 스키마 및 클라이언트
│   ├── ui/                 # @uam/ui       — 공통 UI 컴포넌트
│   └── config/             # @uam/config   — 공통 ESLint/Prettier/TSConfig
├── turbo.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── package.json
└── docker-compose.yml
```

---

## 작업 흐름 요약

| 순서 | 작업 | 핵심 파일 |
|------|------|-----------|
| 1 | 루트 `package.json` 초기화 + pnpm 지정 | `package.json` |
| 2 | pnpm 워크스페이스 선언 | `pnpm-workspace.yaml` |
| 3 | Turborepo 설치 및 파이프라인 정의 | `turbo.json` |
| 4 | 공유 패키지 스캐폴딩 (`packages/*`) | `packages/*/package.json`, `index.ts` |
| 5 | NestJS CLI로 백엔드 앱 생성 (`simulator`, `scheduler`) | `nest-cli.json`, `tsconfig.json` |
| 6 | Vite CLI로 프론트엔드 앱 생성 (`dashboard`) | `vite.config.ts`, `tsconfig.app.json` |
| 7 | 루트에서 `pnpm install` 실행 (심볼릭 링크 구성) | `pnpm-lock.yaml` |
| 8 | Docker Compose로 인프라 정의 | `docker-compose.yml` |
