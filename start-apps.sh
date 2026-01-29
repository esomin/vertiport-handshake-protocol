#!/bin/bash

# dashboard, scheduler, simulator 서브 모듈을 동시에 시작합니다. (gateway 제외)
pnpm dev --filter @uam/scheduler --filter @uam/simulator
# pnpm dev --filter @uam/dashboard --filter @uam/scheduler --filter @uam/simulator
