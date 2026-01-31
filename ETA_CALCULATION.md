# ETA Calculation Logic

> **파일 위치**: `apps/dashboard/src/App.tsx` — ETA 계산 섹션  
> **최종 수정**: 2026-03-01

---

## 개요

대시보드 우측 **Landing Sequence Timeline** 패널은 착륙 우선순위 큐에 있는 기체들이  
버티포트(잠실 헤리패드)까지 도달하는 데 걸리는 예상 시간(ETA)을 실시간으로 계산하여 표시합니다.

```
현재 위치 ──[Haversine 거리]──► 버티포트
                ÷ 크루즈 속도 = 소요 시간(분)
```

---

## 상수 정의

| 상수 | 값 | 설명 |
|------|-----|------|
| `VERTIPORT_LAT` | `37.5133` | 버티포트 위도 (잠실 헤리패드 기준) |
| `VERTIPORT_LNG` | `127.1028` | 버티포트 경도 |
| `CRUISE_SPEED_MS` | `150,000 / 3600 ≈ 41.67 m/s` | 크루즈 속도 150 km/h → m/s 변환 |

---

## Haversine 거리 계산

구면 삼각법(Haversine formula)을 사용하여 두 위경도 좌표 사이의 지표면 거리를 계산합니다.  
지구 반지름 `R = 6,371,000m` 기준.

```typescript
function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6_371_000; // 지구 반지름 (m)
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

### 수식 요약

$$d = 2R \cdot \arctan2\!\left(\sqrt{a},\, \sqrt{1-a}\right)$$

$$a = \sin^2\!\left(\frac{\Delta\phi}{2}\right) + \cos\phi_1\cos\phi_2\sin^2\!\left(\frac{\Delta\lambda}{2}\right)$$

- $\phi$ = 위도(라디안), $\lambda$ = 경도(라디안)
- $\Delta\phi = \phi_2 - \phi_1$, $\Delta\lambda = \lambda_2 - \lambda_1$

---

## ETA 계산 분기

기체 상태에 따라 ETA 계산 방식이 달라집니다.

```typescript
const etaMin = uam.waitingForLanding
  ? 1.5                                         // Case A: 이미 호버링 중
  : Math.round((distM / CRUISE_SPEED_MS) / 60); // Case B: 비행 중
```

### Case A — `waitingForLanding === true` (착륙 대기 / 호버링)

- 기체가 이미 버티포트 근처에서 호버링 중인 상태
- 수평 이동 없이 **수직 하강만** 남아 있음
- 고정값 **1.5분** 적용 (하강 및 착지 완료 예상 시간)

### Case B — `waitingForLanding === false` (비행 중)

```
etaMin = round( distM ÷ CRUISE_SPEED_MS ÷ 60 )
       = round( 거리(m) ÷ 41.67(m/s) ÷ 60 )
       = 분 단위 정수
```

- Haversine으로 계산한 직선 거리 기반
- 실제 항로 우회나 기상 조건은 미반영 (추후 개선 가능)
- `Math.round`로 분 단위 정수화

---

## 도착 예상 시각 계산

```typescript
const arrival = new Date(now.getTime() + etaMin * 60_000);
const arrivalTime = arrival.toLocaleTimeString('ko-KR', {
  hour: '2-digit',
  minute: '2-digit',
});
```

- `now`: 렌더링 시점의 `new Date()`
- `etaMin * 60_000`: 밀리초 단위 변환
- `ko-KR` 로케일로 `HH:MM` 형식 표출

---

## ETA 프로세스 바 스케일링

타임라인 내 각 기체 카드의 가로 게이지 바는 **상대적 ETA 비율**로 표시됩니다.

```typescript
const maxEtaMin = Math.max(...etaList.map(e => e.etaMin), 1);
const barWidth = Math.max(8, Math.round((entry.etaMin / maxEtaMin) * 100));
// barWidth: 8% ~ 100% (최소 8%로 시각적 최소폭 보장)
```

- 목록 중 **가장 먼 기체 = 100%** 를 기준으로 나머지 기체 비율 계산
- 최솟값 8% 보장으로 `waitingForLanding` 기체도 최소 가시성 확보

---

## 표시 대상

```typescript
displayedUams.slice(0, 10)
// 우선순위 기체 최대 10대 (Priority Zone 상위 3 + Standby Queue 7)
```

- `displayedUams`: Redis 우선순위 큐 기반 top-10 목록 (잠금 시 스냅샷)
- 잠금 상태(`isQueueLocked`)에서는 ETA도 스냅샷 시점 기준

---

## 색상 시각화 규칙

| 조건 | 노드 색 | 바 색 | 텍스트 |
|------|---------|------|--------|
| 비상 (`isEmergency`) | 🔴 red-500 | red-500 | red-300 |
| 착륙 대기 (`waitingForLanding`) | 🟡 amber-500 (ring) | amber-500 | amber-300 |
| 상위 3위 (Priority Zone) | 🔵 sky-500 | sky-600 | slate-200 |
| 4~10위 (Standby Queue) | ⬜ slate-600 | slate-600 | slate-400 |

---

## 한계 및 개선 방향

| 항목 | 현재 | 개선 방향 |
|------|------|----------|
| 속도 가정 | 고정 150 km/h | 기체별 실제 속도 필드 수신 |
| 경로 | 직선 거리 | 항공로 우회 경로 반영 |
| 하강 시간 | 고정 1.5분 | 고도 기반 동적 계산 |
| 갱신 주기 | `uam:update` 이벤트마다 | 별도 ETA 전용 스트림 고려 |
| 버티포트 좌표 | 하드코딩 | 환경변수 또는 설정 파일 분리 |
