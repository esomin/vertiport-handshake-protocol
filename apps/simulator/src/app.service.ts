import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { UamVehicleStatus, VehicleState, VertiportKey } from '@uam/types';


@Injectable()
export class AppService implements OnModuleInit {
  private vehicleStates: Map<string, VehicleState> = new Map();

  constructor(@Inject('UAM_SERVICE') private client: ClientProxy) { }

  private readonly INITIAL_FLEET_SIZE = 20;

  // 상수 설정: UAM 운용 가이드라인 반영
  private readonly CRUISE_ALT = 500;        // 순항 고도 (m)
  private readonly APPROACH_ALT = 175;      // 접근 단계 목표 고도 (m)
  private readonly LDP_ALT = 75;            // 최종 착륙 결정 지점 고도 (m)

  private readonly APPROACH_RADIUS_KM = 4.0; // 접근 단계 진입 거리 (4km)
  private readonly LDP_RADIUS_KM = 0.2;     // LDP 진입 거리 (200m)

  private readonly VERTIPORTS = [
    { name: '여의도', key: 'yeouido', lat: 37.525, lng: 126.924 },
    { name: '잠실', key: 'jamsil', lat: 37.513, lng: 127.108 },
    { name: '수서', key: 'suseo', lat: 37.488, lng: 127.123 },
  ];

  onModuleInit() {
    for (let i = 0; i < this.INITIAL_FLEET_SIZE; i++) {
      this.startSimulation();
    }
  }

  /** 위경도 기반 물리적 거리 계산 (Haversine Formula) */
  private getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  startSimulation() {
    const uamId = `UAM-${Math.floor(Math.random() * 1000)}`;
    const start = this.VERTIPORTS[Math.floor(Math.random() * this.VERTIPORTS.length)];
    let end = this.VERTIPORTS[Math.floor(Math.random() * this.VERTIPORTS.length)];
    while (start === end) {
      end = this.VERTIPORTS[Math.floor(Math.random() * this.VERTIPORTS.length)];
    }

    // 초기 위치: 출발지와 목적지 사이 20~80% 지점 (비행 중 상태 시뮬레이션)
    const startRatio = 0.2 + Math.random() * 0.6;
    const state: VehicleState = {
      lat: start.lat + (end.lat - start.lat) * startRatio,
      lng: start.lng + (end.lng - start.lng) * startRatio,
      alt: this.CRUISE_ALT,
      targetLat: end.lat,
      targetLng: end.lng,
      speed: 0.0003 + Math.random() * 0.0007,
      battery: 25 + Math.random() * 65, // 25~90% 사이 시작
      destinationKey: end.key,
      intervalId: null,
      waitingForLanding: false,
      landingApproved: false,
    };

    state.intervalId = setInterval(() => this.updateMovement(uamId, state), 1000);
    this.vehicleStates.set(uamId, state);
  }

  private updateMovement(uamId: string, state: VehicleState) {
    const distanceKm = this.getDistanceKm(state.lat, state.lng, state.targetLat, state.targetLng);

    // 1. 착륙 완료 판정
    if (state.landingApproved && state.alt <= 0) {
      this.stopSimulation(uamId);
      return;
    }

    // 2. 이동 로직
    let moveLat = 0, moveLng = 0;
    // LDP(0.2km) 도달 전까지만 이동 (LDP 도달 시 호버링)
    if (distanceKm > this.LDP_RADIUS_KM) {
      const dLat = state.targetLat - state.lat;
      const dLng = state.targetLng - state.lng;
      const moveRatio = state.speed / Math.sqrt(dLat * dLat + dLng * dLng);
      moveLat = dLat * moveRatio;
      moveLng = dLng * moveRatio;
      state.lat += moveLat;
      state.lng += moveLng;
      state.waitingForLanding = false;
    } else {
      state.waitingForLanding = true; // LDP 진입
      if (state.destinationKey !== 'jamsil') {
        state.landingApproved = true;
      }
    }

    // 3. 단계별 고도 시뮬레이션
    if (state.landingApproved) {
      // [착륙 단계] 승인 후 고도 감소 (초당 20m)
      state.alt = Math.max(0, state.alt - 20);
    } else if (state.waitingForLanding) {
      // [LDP 단계] 최종 승인 전 75m 호버링 유지
      if (state.alt > this.LDP_ALT) state.alt -= 25;
      else state.alt = this.LDP_ALT;
    } else if (distanceKm <= this.APPROACH_RADIUS_KM) {
      // [접근 단계] 4km 이내 진입 시 175m로 점진적 하강
      if (state.alt > this.APPROACH_ALT) state.alt -= 15;
    } else {
      // [순항 단계] 500m 유지
      if (state.alt < this.CRUISE_ALT) state.alt += 10;
    }

    // 4. 배터리 소모 (스케줄러에서 FB 계산용)
    const drainRate = 0.05 + (state.speed * 150);
    state.battery = Math.max(0, state.battery - drainRate);

    // 5. 스케줄러를 위한 물리 데이터 환산
    const speedKmh = (state.speed * 110) * 3600; // 위경도 속도 -> 약 km/h 환산
    const etaSeconds = speedKmh > 0 ? (distanceKm / speedKmh) * 3600 : 0;
    const heading = (Math.atan2(moveLng, moveLat) * (180 / Math.PI) + 360) % 360;

    const status: UamVehicleStatus = {
      uamId,
      latitude: state.lat,
      longitude: state.lng,
      altitude: Math.round(state.alt),
      batteryPercent: Math.round(state.battery * 10) / 10,
      timestamp: Date.now(),
      heading: (moveLat === 0 && moveLng === 0) ? 0 : heading,
      targetLat: state.targetLat,
      targetLng: state.targetLng,
      destinationKey: state.destinationKey,
      distanceToTargetKm: Math.round(distanceKm * 100) / 100,
      speedKmh: Math.round(speedKmh),
      etaSeconds: Math.round(etaSeconds),
      waitingForLanding: state.waitingForLanding,
    };

    this.client.emit(`uam/status/${state.destinationKey}`, status);
  }

  approveLanding(uamId: string) {
    const state = this.vehicleStates.get(uamId);
    if (state && state.waitingForLanding) {
      state.landingApproved = true;
      console.log(`[Simulator] ${uamId} Landing Approved. Descending from LDP.`);
    }
  }

  stopSimulation(uamId: string) {
    const state = this.vehicleStates.get(uamId);
    if (state) {
      clearInterval(state.intervalId);
      this.vehicleStates.delete(uamId);
      console.log(`[Simulator] ${uamId} Landed safely.`);
      setTimeout(() => this.startSimulation(), 2000);
    }
  }
}