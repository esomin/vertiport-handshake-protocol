import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { type UamVehicleStatus } from '@uam/types';
import { AppService } from './app.service';
import { EventsGateway } from './events.gateway';

// 잠실 버티포트 좌표
const JAMSIL_LAT = 37.513;
const JAMSIL_LNG = 127.100;

// 위경도 유클리드 거리 계산 (정규화용 최대치: 서울 대각선 약 0.15도)
const MAX_DIST = 0.15;
// 최대 순항고도 기준 (m)
const MAX_ALT = 500;

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly eventsGateway: EventsGateway,
  ) { }

  /**
   * [Stream B] 착륙 큐 전용: 잠실 목적지 기체만 구독
   * - 우선순위 점수 계산 후 Redis ZSET에 저장
   * - NestJS MQTT 라우터는 구체 패턴을 우선 매칭하므로
   *   와일드카드 핸들러(handleAllStatus)가 호출되지 않음 →
   *   여기서 직접 updateMapBuffer도 함께 호출
   */
  @MessagePattern('uam/status/jamsil')
  async handleJamsilStatus(@Payload() data: UamVehicleStatus) {
    // 착륙 완료된 기체는 Redis 재저장 및 버퍼 갱신 관하지 않음
    if (this.eventsGateway.isAlreadyLanded(data.uamId)) {
      return;
    }
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

    // [Stream B] Redis ZSET에 저장 (착륙 큐 우선순위 계산용)
    await this.appService.updatePriorityQueue(data.uamId, priorityScore, data);

    // [Stream A] 와일드카드 핸들러가 건너뛰어지므로 여기서 직접 지도 버퍼 갱신
    this.eventsGateway.updateMapBuffer(data);
  }

  /**
   * [Stream A] 지도용 rawBuffer 전용: 목적지 무관 전체 기체 구독
   * - MQTT 와일드카드로 모든 버티포트 토픽 수신 → Map3D 렌더링용 버퍼에만 적재
   * - 착륙 큐 로직(점수 계산/Redis)은 수행하지 않음
   */
  @MessagePattern('uam/status/+')
  handleAllStatus(@Payload() data: UamVehicleStatus) {
    this.eventsGateway.updateMapBuffer(data);
  }
}
