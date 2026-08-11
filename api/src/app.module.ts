import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CRMModule } from './crm/crm.module';
import { RealtimeModule } from './realtime/realtime.module';
import { MailModule } from './mail/mail.module';
import { CRMUsersModule } from './crm-users/crm-users.module';
import { TrashModule } from './trash/trash.module';
import { TeamsBotModule } from './teams-bot/teams-bot.module';
import { RedisModule } from './redis/redis.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { AnthropicModule } from './integrations/anthropic/anthropic.module';
import { DataIntelligenceModule } from './crm/data-intelligence/data-intelligence.module';
import { WhatsAppTemplatesModule } from './crm/whatsapp-templates/whatsapp-templates.module';
import { mongoConnectionLabel } from './common/mongo-connection-label.util';
import {
  LOCAL_MONGO_URI,
  LOCAL_MONGO_URI_CRM,
} from './common/mongo-local-uris';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    RedisModule,
    CloudinaryModule,
    AnthropicModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', '../.env.local', '../.env'],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const uri =
          configService.get<string>('MONGO_URI') ||
          configService.get<string>('MONGO_URI_CRM') ||
          LOCAL_MONGO_URI;
        console.log(`[MongoDB] Core → ${mongoConnectionLabel(uri, uri)}`);
        return { uri };
      },
    }),
    MongooseModule.forRootAsync({
      connectionName: 'crmConnection',
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const uri =
          configService.get<string>('MONGO_URI_CRM') || LOCAL_MONGO_URI_CRM;
        console.log(`[MongoDB] CRM → ${mongoConnectionLabel(uri, uri)}`);
        return { uri };
      },
    }),
    AuthModule,
    UsersModule,
    NotificationsModule,
    CRMModule,
    DataIntelligenceModule,
    WhatsAppTemplatesModule,
    RealtimeModule,
    MailModule,
    CRMUsersModule,
    TrashModule,
    TeamsBotModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
