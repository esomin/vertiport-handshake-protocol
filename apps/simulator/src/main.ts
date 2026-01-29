import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // MQTT 마이크로서비스 연동 (수신을 위해)
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.MQTT,
    options: {
      url: 'mqtt://localhost:1883',
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3001);
  console.log('UAM Simulator is running on port 3001');
}
bootstrap();
