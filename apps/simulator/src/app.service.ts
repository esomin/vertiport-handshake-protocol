import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { UamVehicleStatus, VehicleState } from '@uam/types';


@Injectable()
export class AppService implements OnModuleInit {
  private vehicleStates: Map<string, VehicleState> = new Map();

  constructor(@Inject('UAM_SERVICE') private client: ClientProxy) { }

  private readonly INITIAL_FLEET_SIZE = 25;

  // 서울 주요 거점 (버티포트 후보지)
  private readonly VERTIPORTS = [
    { name: '김포공항', lat: 37.558, lng: 126.802 },
    { name: '여의도', lat: 37.525, lng: 126.924 },
    { name: '잠실', lat: 37.513, lng: 127.100 },
    { name: '구로', lat: 37.503, lng: 126.882 },
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

    const state: VehicleState = {
      lat: start.lat,
      lng: start.lng,
      alt: 0, // 이륙 전
      targetLat: end.lat,
      targetLng: end.lng,
      speed: 0.0005 + Math.random() * 0.0003, // 초당 이동 거리 (약 50~80m 가정)
      intervalId: undefined as unknown as NodeJS.Timeout,
    };

    state.intervalId = setInterval(() => {
      this.updateMovement(uamId, state);
    }, 1000);

    this.vehicleStates.set(uamId, state);
  }

  private updateMovement(uamId: string, state: VehicleState) {
    // 1. 목적지와의 거리 계산
    const dLat = state.targetLat - state.lat;
    const dLng = state.targetLng - state.lng;
    const distance = Math.sqrt(dLat * dLat + dLng * dLng);

    // 2. 목적지 도착 체크 (아주 가까워지면 종료)
    if (distance < 0.001) {
      this.stopSimulation(uamId);
      return;
    }

    // 3. 이동 벡터 계산 (정규화 후 속도 곱하기)
    const moveLat = (dLat / distance) * state.speed;
    const moveLng = (dLng / distance) * state.speed;

    // 4. 좌표 업데이트
    state.lat += moveLat;
    state.lng += moveLng;

    // 5. 고도 시뮬레이션 (이륙/순항/착륙)
    if (distance > 0.01) {
      state.alt = Math.min(500, state.alt + 50); // 이륙 중
    } else {
      state.alt = Math.max(0, state.alt - 50); // 착륙 준비
    }

    // 6. Heading 계산 (라디안을 도 단위로 변환)
    const heading = Math.atan2(moveLng, moveLat) * (180 / Math.PI);

    const status: UamVehicleStatus = {
      uamId,
      latitude: state.lat,
      longitude: state.lng,
      altitude: state.alt,
      batteryPercent: 80, // 로직 생략
      isEmergency: false,
      timestamp: Date.now(),
      heading: (heading + 360) % 360,
      targetLat: state.targetLat,
      targetLng: state.targetLng,
      speed: state.speed,
    };

    this.client.emit('uam/status', status);
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