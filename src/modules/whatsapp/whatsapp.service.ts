import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Client, NoAuth } from 'whatsapp-web.js';


@Injectable()
export class WhatsAppService implements OnModuleInit {
  private client: Client = new Client({
    authStrategy: new NoAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      protocolTimeout: 600000, // Increase the protocol timeout to 60 seconds
    },
  });

  constructor(private eventEmitter: EventEmitter2) {
  }

  onModuleInit() {
    this.client.on('qr', (qr) => {
      this.eventEmitter.emit('qrcode.created', qr);
    });

    this.client.on('ready', () => {
      console.log('WhatsApp Web client is ready!');
    });

    this.client.initialize();
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
