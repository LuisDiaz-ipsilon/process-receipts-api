import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { DbService } from './db.service';
import { ReceiptController } from './receipt/controller/receipt.controller';
import { ReceiptService } from './receipt/service/receipt.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [ReceiptController],
  providers: [AppService, ReceiptService, DbService]
})
export class AppModule {}
