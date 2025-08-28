import { Body, Controller, Post } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { CreateReceiptDto } from '../dto/create-receipt.dto';
import { ReceiptService } from '../service/receipt.service';

@Controller('api/process')
export class ReceiptController {
  constructor(private readonly service: ReceiptService) {}

  @Post()
  async create(@Body() body: any) {
    const dto = plainToInstance(CreateReceiptDto, body);
    await validateOrReject(dto);
    const result = await this.service.processReceipt(dto.idclient, dto.imageBase64);
    return result; // { monto, file }
  }
}
