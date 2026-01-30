#!/bin/bash
# dashboard, scheduler, simulator 서브 모듈을 동시에 시작합니다.
# pnpm dev --filter "@uam/*" --parallel 

#!/bin/bash

# pnpm exec를 사용하여 로컬에 설치된 concurrently를 실행합니다.
pnpm exec concurrently -n "SCH,SIM,DSH" -c "bgGreen,bgBlue, bgMagenta" \
  "pnpm dev --filter @uam/scheduler" \
  "pnpm dev --filter @uam/simulator" \
  "pnpm dev --filter @uam/dashboard"