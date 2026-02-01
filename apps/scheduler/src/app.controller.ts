import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { type UamVehicleStatus } from '@uam/types';
import { AppService } from './app.service';
import { EventsGateway } from './events.gateway';

// 서울 주요 거점 간 최대 거리를 약 20km로 가정 (거리 정규화용)
const MAX_DISTANCE_KM = 20;

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
   * 와일드카드 핸들러(handleAllStatus)가 호출되지 않음 →
   * 여기서 직접 updateMapBuffer도 함께 호출
   */
  @MessagePattern('uam/status/jamsil')
  async handleJamsilStatus(@Payload() data: UamVehicleStatus) {
    // 착륙 완료된 기체는 Redis 재저장 및 버퍼 갱신 관여하지 않음
    if (this.eventsGateway.isAlreadyLanded(data.uamId)) {
      return;
    }

    /**
     * [우선순위 점수 계산] 높을수록 먼저 착륙 승인 대상 (총점 1000점 만점)
     */

    // 1. 비상 상황 (S_E): 500점 (배터리 15% 미만 시 즉시 최고 우선순위 부여)
    const isEmergency = data.batteryPercent < 15;
    const emergencyScore = isEmergency ? 500 : 0;

    // 2. 배터리 (F_B): 최대 350점
    // - 20% 초과: 0점
    // - 10% ~ 20% 사이: 20%에서 0점, 10%에서 350점으로 급격히 상승 (선형 비례 계산)
    // - 10% 미만: 350점 만점 (이 경우 S_E 500점도 함께 받아 총 850점 이상 확보)
    let batteryScore = 0;
    if (data.batteryPercent <= 10) {
      batteryScore = 350;
    } else if (data.batteryPercent <= 20) {
      batteryScore = ((20 - data.batteryPercent) / 10) * 350;
    }

    // 3. 거리/시간 (F_D): 최대 150점
    // - 시뮬레이터에서 계산해준 distanceToTargetKm(물리적 거리) 활용
    // - 0km에 가까울수록 150점에 근접, MAX_DISTANCE_KM(20km) 이상이면 0점
    const normalizedDist = Math.min(data.distanceToTargetKm, MAX_DISTANCE_KM);
    const distScore = Math.max(0, (1 - normalizedDist / MAX_DISTANCE_KM)) * 150;

    // 총 우선순위 점수 산출
    const priorityScore = emergencyScore + batteryScore + distScore;

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