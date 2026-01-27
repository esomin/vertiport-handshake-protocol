import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // MQTT 마이크로서비스 연결
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.MQTT,
    options: {
      url: 'mqtt://localhost:1883',
    },
  });

  await app.startAllMicroservices();

  await app.listen(process.env.PORT ?? 3002);
  console.log('UAM Scheduler Engine is running');
}
bootstrap();
