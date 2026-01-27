import { Controller, Get } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { type UamVehicleStatus } from '@uam/types';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @MessagePattern('uam/status') // 시뮬레이터가 쏘는 토픽 구독
    async handleVehicleStatus(@Payload() data: UamVehicleStatus) {
      // 1. 우선순위 점수 계산 로직 (간단 버전)
      // 비상이면 +1000점, 배터리가 낮을수록 높은 점수
      const priorityScore = (data.isEmergency ? 1000 : 0) + (100 - data.batteryPercent);

      // 2. Redis ZSET에 저장 요청
      await this.appService.updatePriorityQueue(data.uamId, priorityScore, data);
    }
}
