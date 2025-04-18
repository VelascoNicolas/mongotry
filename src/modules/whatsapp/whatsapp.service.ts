import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Client, RemoteAuth } from 'whatsapp-web.js';
import { envConfig } from '../../config/envs';
import { MongoStore } from 'wwebjs-mongo';
import mongoose from 'mongoose';

@Injectable()
export class WhatsAppService {
  private client: Client;

  constructor(private eventEmitter: EventEmitter2) {
    mongoose.connect(envConfig.MONGODB_URI).then(() => {
      const store = new MongoStore({ mongoose: mongoose });
      this.client = new Client({
        authStrategy: new RemoteAuth({
          store: store,
          backupSyncIntervalMs: 300000
        }),
        puppeteer: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          protocolTimeout: 60000,
        },
      });

      this.client.initialize();
    });
  }

  onModuleInit() {
    this.client.on('qr', (qr) => {
      this.eventEmitter.emit('qrcode.created', qr);
    });

    this.client.on('ready', () => {
      console.log('WhatsApp Web client is ready!');
    });

    this.client.on('remote_session_saved', async () => {
      console.log('WhatsApp Web client session saved!');
    });
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
