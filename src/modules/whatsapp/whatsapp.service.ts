import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Client, NoAuth } from 'whatsapp-web.js';
import chromium from '@sparticuz/chromium-min';

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private client: Client;

  constructor(private eventEmitter: EventEmitter2) {
    
  }

  async onModuleInit() {
    try {
      // Use lighter chromium-min for Vercel
      chromium.setHeadlessMode = true;
      const executablePath = await chromium.executablePath();

      this.client = new Client({
        authStrategy: new NoAuth(),
        puppeteer: {
          headless: true,
          args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
          executablePath,
        },
      });

      this.client.on('qr', (qr) => this.eventEmitter.emit('qrcode.created', qr));
      this.client.on('ready', () => console.log('Client ready'));
      
      await this.client.initialize();
    } catch (error) {
      console.error('WhatsApp init failed:', error);
    }
  }

  // Send a WhatsApp message
  async sendMessage(to: string, message: string): Promise<void> {
    try {
      const finalNumber = `54${to}`; // Add the country code to the number
      const numberDetails = await this.client.getNumberId(finalNumber);

      if (!numberDetails) {
        throw new Error(
          `The phone number ${to} is not registered on WhatsApp.`
        );
      }

      await this.client.sendMessage(numberDetails._serialized, message);
      console.log(`WhatsApp message sent to ${to}: ${message}`);
    } catch (error) {
      console.error(
        'Error sending WhatsApp message:',
        (error as Error).message
      );
      throw error;
    }
  }

  // Disconnect the client and clean up
  async disconnect(): Promise<void> {
    try {
      await this.client.logout();
      console.log('WhatsApp Web client disconnected.');
    } catch (error) {
      console.error(
        'Error disconnecting WhatsApp client:',
        (error as Error).message
      );
    }
  }
}
