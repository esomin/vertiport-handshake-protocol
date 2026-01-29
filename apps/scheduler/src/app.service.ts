import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Redis } from 'ioredis';

@Injectable()
export class AppService {
  private redis = new Redis({ host: 'localhost', port: 6379 });

  constructor(@Inject('MQTT_SERVICE') private mqttClient: ClientProxy) { }

  async updatePriorityQueue(uamId: string, score: number, data: any) {
    const pipeline = this.redis.pipeline();

    // ZSET에 점수와 함께 ID 저장 (score 기준 오름차순/내림차순 정렬됨)
    pipeline.zadd('uam:landing:queue', score, uamId);

    // 상세 정보는 별도 Hash나 String으로 저장 (나중에 조회용)
    pipeline.set(`uam:detail:${uamId}`, JSON.stringify(data), 'EX', 60);

    await pipeline.exec();
    console.log(`[Ranked] ${uamId} - Score: ${score.toFixed(1)}`);
  }

  async sendLandingCommand(uamId: string) {
    // 착륙 명령을 MQTT로 전송 (시뮬레이터가 이 토픽을 구독해야 함)
    this.mqttClient.emit('uam/command/land', {
      uamId,
      command: 'LAND',
      timestamp: new Date().toISOString(),
    });

    // 착륙 명령이 내려진 기체는 큐 및 상세 데이터에서 정리
    await this.redis.zrem('uam:landing:queue', uamId);
    await this.redis.del(`uam:detail:${uamId}`);

    console.log(`[Command] Sent landing command to ${uamId} via MQTT`);
  }
}