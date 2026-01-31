### 변경 사항 요약

1. **데이터 흐름 이원화**
   - 기존: Redis를 통한 폴링(Polling) 방식만 존재.
   - 변경: 실시간 지도 업데이트를 위해 `AppController`에서 `EventsGateway`로 직접 데이터를 전달하는 실시간 스트리밍 경로 추가.

2. **대시보드 업데이트 분리**
   - **지도 (Map)**: `map:update` 이벤트를 통해 최대 50개의 실시간 위치 데이터를 즉시 반영.
   - **착륙 큐 (Landing Queue)**: 기존과 동일하게 Redis에서 상위 10개 데이터를 1초 간격으로 폴링하여 `uam:update` 이벤트로 반영.

3. **시스템 효율성 개선**
   - 실시간성이 중요한 지도 데이터는 스트리밍 방식으로 전환하고, 정렬 및 가공이 필요한 큐 데이터는 폴링 방식을 유지하여 데이터 특성에 맞는 처리 구조 확보.



[기존]
``` mermaid
flowchart LR
    SIM[Simulator] -->|MQTT uam/status/jamsil| CTRL[AppController]
    CTRL -->|updatePriorityQueue| SVC[AppService]
    SVC -->|ZADD + SET| REDIS[(Redis)]
    GW[EventsGateway] -->|setInterval 1초| REDIS
    REDIS -->|zrevrange top 10| GW
    GW -->|uam:update emit| DASH[Dashboard]
```

[변경]
``` mermaid
flowchart LR
    SIM[Simulator] -->|MQTT uam/status/jamsil| CTRL[AppController]
    CTRL -->|updatePriorityQueue| SVC[AppService]
    SVC -->|ZADD + SET| REDIS[(Redis)]

    CTRL -->|emit raw data| GW
    GW -->|map:update 50개| DASH[Dashboard - 지도]
    
    GW -->|setInterval 1초 polling| REDIS
    REDIS -->|zrevrange top 10| GW
    GW -->|uam:update 10개| DASH[Dashboard - 착å륙 큐]
```

```
MQTT 수신
  └─ AppController.handleVehicleStatus()
       ├─ [Stream B] updatePriorityQueue() → Redis ZADD/SET
       └─ [Stream A] eventsGateway.updateMapBuffer()
                          └─ rawBuffer (Map<uamId, data>, max 50)

EventsGateway.onModuleInit()
  ├─ setInterval(500ms) → rawBuffer → emit('map:update', 최대 50개)  ← 지도 렌더링
  └─ setInterval(1000ms) → Redis zrevrange → emit('uam:update', top 10) ← 착륙 큐

```



```
소켓 이벤트          state          렌더 대상
────────────────────────────────────────────────────────
map:update (50개)  → mapUams      → Map3D (지도 마커)
uam:update (10개)  → uams         → 착륙 승인 큐 카드
                    ↓ (잠금 적용)
                   displayedUams
```
