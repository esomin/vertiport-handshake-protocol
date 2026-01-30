import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { UamVehicleStatus, VehicleState, VertiportKey } from '@uam/types';


@Injectable()
export class AppService implements OnModuleInit {
  private vehicleStates: Map<string, VehicleState> = new Map();

  constructor(@Inject('UAM_SERVICE') private client: ClientProxy) { }

  private readonly INITIAL_FLEET_SIZE = 50;

  // 서울 주요 거점 (버티포트 후보지)
  private readonly VERTIPORTS: { name: string; key: VertiportKey; lat: number; lng: number }[] = [
    { name: '여의도', key: 'yeouido', lat: 37.525, lng: 126.924 },
    { name: '잠실', key: 'jamsil', lat: 37.513, lng: 127.108 },
    { name: '강남', key: 'gangnam', lat: 37.501, lng: 127.037 },
    { name: '수서', key: 'suseo', lat: 37.488, lng: 127.123 },
  ];

  onModuleInit() {
    for (let i = 0; i < this.INITIAL_FLEET_SIZE; i++) {
      this.startSimulation();
    }
  }

  startSimulation() {
    const uamId = `UAM-${Math.floor(Math.random() * 1000)}`;

    // 시작점과 목적지 랜덤 설정
    const start = this.VERTIPORTS[Math.floor(Math.random() * this.VERTIPORTS.length)];
    let end = this.VERTIPORTS[Math.floor(Math.random() * this.VERTIPORTS.length)];
    while (start === end) {
      end = this.VERTIPORTS[Math.floor(Math.random() * this.VERTIPORTS.length)];
    }

    // 기체마다 랜덤한 시작 위치 (출발지로부터 0~50% 사이, 접근 구간과 충분한 마진 확보)
    // const startRatio = Math.random() * 0.5;
    // 기체마다 랜덤한 시작 위치 (출발지로부터 20~80% 사이)
    const startRatio = 0.2 + Math.random() * 0.6;
    const startLat = start.lat + (end.lat - start.lat) * startRatio;
    const startLng = start.lng + (end.lng - start.lng) * startRatio;

    const state: VehicleState = {
      lat: startLat,
      lng: startLng,
      alt: 500,  // 이미 순항 중인 상태
      targetLat: end.lat,
      targetLng: end.lng,
      speed: 0.0003 + Math.random() * 0.0007, // 0.0003~0.001 (3배 분산)
      battery: 20 + Math.random() * 70, // 20~90% (넓은 범위)
      destinationKey: end.key,
      intervalId: undefined as unknown as ReturnType<typeof setInterval>,
      waitingForLanding: false,
      landingApproved: false,
    };

    state.intervalId = setInterval(() => {
      this.updateMovement(uamId, state);
    }, 1000);

    this.vehicleStates.set(uamId, state);
  }

  private readonly HOVER_ALT = 150;         // 착륙 대기 호버링 고도 (m)
  private readonly APPROACH_DISTANCE = 0.003; // 접근 시작 거리 (위경도 단위, ≈ 1km)

  private updateMovement(uamId: string, state: VehicleState) {
    // 1. 목적지와의 거리 계산
    const dLat = state.targetLat - state.lat;
    const dLng = state.targetLng - state.lng;
    const distance = Math.sqrt(dLat * dLat + dLng * dLng);

    // 2. 착륙 완료 판정: 승인 후 고도가 0 이하면 착륙 완료 처리
    if (state.landingApproved && state.alt <= 0) {
      this.stopSimulation(uamId);
      return;
    }

    // 3. 이동 / 호버링 결정
    let moveLat = 0;
    let moveLng = 0;

    if (!state.waitingForLanding) {
      // 아직 호버링 대기 전 → 목적지 방향으로 이동
      moveLat = (dLat / distance) * state.speed;
      moveLng = (dLng / distance) * state.speed;
      state.lat += moveLat;
      state.lng += moveLng;

      // 접근 거리 진입 → 호버링 대기 상태로 전환
      if (distance <= this.APPROACH_DISTANCE) {
        state.waitingForLanding = true;
        console.log(`[Simulator] ${uamId} entering hover: waiting for landing approval.`);
      }
    }
    // waitingForLanding === true 이면 좌표 고정 (호버링)

    // 4. 고도 시뮬레이션 (3단계)
    if (!state.waitingForLanding) {
      // [순항 단계] 목표 고도 500m 유지
      state.alt = Math.min(500, state.alt + 50);
    } else if (!state.landingApproved) {
      // [호버링 대기 단계] 착륙 승인 전: 호버 고도(150m)에서 유지
      if (state.alt > this.HOVER_ALT) {
        state.alt = Math.max(this.HOVER_ALT, state.alt - 30);
      } else {
        state.alt = this.HOVER_ALT; // 호버 고도 고정
      }
    } else {
      // [착륙 단계] 착륙 승인 후: 서서히 고도 감소
      state.alt = Math.max(0, state.alt - 30);
    }

    // 5. 배터리 감소 (속도에 비례, 초당 0.08~0.2% 소모)
    const drainRate = 0.08 + state.speed * 200;
    state.battery = Math.max(0, state.battery - drainRate);
    const isEmergency = state.battery < 10;

    // 6. Heading 계산 (이동 중일 때만 의미 있음, 호버링 시 이전 heading 유지)
    const heading = Math.atan2(moveLng, moveLat) * (180 / Math.PI);

    const status: UamVehicleStatus = {
      uamId,
      latitude: state.lat,
      longitude: state.lng,
      altitude: state.alt,
      batteryPercent: Math.round(state.battery * 10) / 10,
      isEmergency,
      timestamp: Date.now(),
      heading: (moveLat === 0 && moveLng === 0) ? 0 : (heading + 360) % 360,
      targetLat: state.targetLat,
      targetLng: state.targetLng,
      speed: state.speed,
      destinationKey: state.destinationKey,
      waitingForLanding: state.waitingForLanding,
    };

    // 목적지 거점별 토픽으로 퍼블리시
    this.client.emit(`uam/status/${state.destinationKey}`, status);
  }

  /** 착륙 승인: 컨트롤러에서 landing command 수신 시 호출 */
  approveLanding(uamId: string) {
    const state = this.vehicleStates.get(uamId);
    if (!state) {
      console.log(`[Simulator] approveLanding: Vehicle ${uamId} not found.`);
      return;
    }
    if (!state.waitingForLanding) {
      console.log(`[Simulator] approveLanding: ${uamId} is not in hover state, ignoring.`);
      return;
    }
    state.landingApproved = true;
    console.log(`[Simulator] Landing approved for ${uamId}. Starting descent.`);
  }

  stopSimulation(uamId: string) {
    const state = this.vehicleStates.get(uamId);
    if (state) {
      clearInterval(state.intervalId);
      this.vehicleStates.delete(uamId);
      console.log(`[Simulator] Vehicle ${uamId} has successfully landed and stopped broadcasting.`);

      // 기체가 착륙했으므로, 트래픽 유지를 위해 2초 뒤 새로운 기체 생성
      setTimeout(() => {
        this.startSimulation();
      }, 2000);
    } else {
      console.log(`[Simulator] Warning: Vehicle ${uamId} not found or already stopped.`);
    }
  }
}