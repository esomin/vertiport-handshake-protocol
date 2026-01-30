import { Controller, Get } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { type UamVehicleStatus } from '@uam/types';
import { AppService } from './app.service';

// 잠실 버티포트 좌표
const JAMSIL_LAT = 37.513;
const JAMSIL_LNG = 127.100;

// 위경도 유클리드 거리 계산 (정규화용 최대치: 서울 대각선 약 0.15도)
const MAX_DIST = 0.15;
// 최대 순항고도 기준 (m)
const MAX_ALT = 500;

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @MessagePattern('uam/status/jamsil') // 잠실 목적지 기체만 구독
  async handleVehicleStatus(@Payload() data: UamVehicleStatus) {
    /**
     * [우선순위 점수 계산] 높을수록 먼저 착륙 승인 대상
     *
     * 1. 비상 여부     : +1000 (최우선)
     * 2. 배터리 잔량   : (100 - battery) * 4  → 최대  400점 (낮을수록 위험)
     * 3. 잠실까지 거리 : (1 - dist/MAX_DIST) * 300 → 최대 300점 (가까울수록 곧 도착)
     * 4. 현재 고도     : (1 - alt/MAX_ALT) * 150  → 최대 150점 (낮을수록 착륙 임박)
     */
    const emergency = data.isEmergency ? 1000 : 0;

    // 배터리 점수 (낮을수록 +)
    const batteryScore = (100 - Math.max(0, Math.min(100, data.batteryPercent))) * 2;

    // 잠실까지 거리 점수 (가까울수록 +)
    const dLat = data.latitude - JAMSIL_LAT;
    const dLng = data.longitude - JAMSIL_LNG;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    const distScore = Math.max(0, (1 - dist / MAX_DIST)) * 300;

    // 고도 점수 (낮을수록 = 착륙 준비 중 = +)
    const altScore = Math.max(0, (1 - data.altitude / MAX_ALT)) * 150;

    const priorityScore = emergency + batteryScore + distScore + altScore;

    // Redis ZSET에 저장
    await this.appService.updatePriorityQueue(data.uamId, priorityScore, data);
  }
}
