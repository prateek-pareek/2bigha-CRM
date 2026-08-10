import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QuickChatModule } from '../../quick-chat/quick-chat.module';

@Module({
  imports: [
    QuickChatModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'supersecret',
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
