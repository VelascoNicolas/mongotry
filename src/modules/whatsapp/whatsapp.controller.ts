import { Controller, Get, Res, Param, Post } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import * as QRCode from 'qrcode';
import { Response } from 'express';
import { OnEvent } from '@nestjs/event-emitter';

@Controller('bot')
export class WhatsAppController {
  private qrCode: string;
  constructor(private whatsAppService: WhatsAppService) {}

  @OnEvent('qrcode.created')
  handleQrcodeCreatedEvent(qrCode: string) {
    console.log('QR Code Event Received:', qrCode); // Debug log
    this.qrCode = qrCode;
  }

  @Get('qrcode')
  async getQrCode(@Res() response: Response) {
    if (!this.qrCode) {
      return response.status(404).send('QR code not found');
    }

    response.setHeader('Content-Type', 'image/png');
    QRCode.toFileStream(response, this.qrCode);
  }

  @Post('disconnect')
  async disconnect() {
    await this.whatsAppService.disconnect();
  }
}
