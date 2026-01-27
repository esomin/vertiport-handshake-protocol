import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class AppService {
  private redis = new Redis({ host: 'localhost', port: 6379 });

  async updatePriorityQueue(uamId: string, score: number, data: any) {
    const pipeline = this.redis.pipeline();

    // ZSET에 점수와 함께 ID 저장 (score 기준 오름차순/내림차순 정렬됨)
    pipeline.zadd('uam:landing:queue', score, uamId);

    // 상세 정보는 별도 Hash나 String으로 저장 (나중에 조회용)
    pipeline.set(`uam:detail:${uamId}`, JSON.stringify(data), 'EX', 60);

    await pipeline.exec();
    console.log(`[Ranked] ${uamId} - Score: ${score.toFixed(1)}`);
  }
}