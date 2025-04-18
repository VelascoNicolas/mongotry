import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Client, RemoteAuth } from 'whatsapp-web.js';
import { envConfig } from '../../config/envs';
import { MongoStore } from 'wwebjs-mongo';
import mongoose from 'mongoose';

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private client: Client;
  private readonly logger = new Logger(WhatsAppService.name);
  private isInitialized = false; // Flag to prevent double initialization

  // Constructor is now simpler, only inject dependencies
  constructor(private eventEmitter: EventEmitter2) {}

  async onModuleInit() {
    if (this.isInitialized) {
      this.logger.warn('Attempted to initialize WhatsApp service multiple times.');
      return; // Prevent double initialization
    }

    try {
      this.logger.log('Connecting to MongoDB...');
      // Connect to MongoDB first
      await mongoose.connect(envConfig.MONGODB_URI);
      this.logger.log('MongoDB connected successfully.');

      // Create the store and client *after* successful connection
      const store = new MongoStore({ mongoose: mongoose });
      this.client = new Client({
        authStrategy: new RemoteAuth({
          store: store,
          clientId: 'my-client', // Ensure clientId is set
          backupSyncIntervalMs: 300000
        }),
        puppeteer: {
          headless: true,
          args: [ // Keep args optimized for server/container
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--no-first-run',
              '--no-zygote',
              '--disable-gpu'
          ],
          // executablePath: undefined // Ensure not set unless needed
        }
      });
      this.logger.log('WhatsApp Client configured.');

      // --- Setup Listeners ---
      this.logger.log('Setting up WhatsApp client event listeners...');
      this.client.on('qr', (qr) => {
        this.logger.log('QR Code received');
        this.eventEmitter.emit('qrcode.created', qr);
      });

      this.client.on('ready', () => {
        this.logger.log('WhatsApp Web client is ready!');
      });

      this.client.on('remote_session_saved', async () => {
        this.logger.log('WhatsApp Web client remote session saved!');
      });

      this.client.on('authenticated', () => {
          this.logger.log('WhatsApp client authenticated!');
      });

      this.client.on('auth_failure', (msg) => {
          this.logger.error('WhatsApp authentication failure:', msg);
      });

      this.client.on('disconnected', (reason) => {
          this.logger.warn('WhatsApp client disconnected:', reason);
          this.isInitialized = false; // Reset flag on disconnect
          // Potentially implement reconnection logic here
      });
      // --- End Listeners ---

      // --- Initialize Client ---
      this.logger.log('Initializing WhatsApp client...');
      await this.client.initialize();
      this.isInitialized = true;
      this.logger.log('WhatsApp client initialized successfully.');
      // --- End Initialize ---

    } catch (error) {
      this.logger.error('Failed during WhatsAppService initialization:', error);
      // Ensure client is not considered initialized if setup fails
      this.isInitialized = false;
      // Optionally re-throw or handle critical failure
    }
  }

  // Send a WhatsApp message
  async sendMessage(to: string, message: string): Promise<void> {
    if (!this.client || !this.isInitialized) {
        this.logger.error('Cannot send message: WhatsApp client is not initialized or ready.');
        throw new Error('WhatsApp client not ready.');
    }
    try {
      const finalNumber = `54${to}`; // Add the country code to the number
      this.logger.log(`Attempting to send message to ${finalNumber}`);
      const numberDetails = await this.client.getNumberId(finalNumber);

      if (!numberDetails) {
        this.logger.warn(`Phone number ${to} (${finalNumber}) is not registered on WhatsApp.`);
        throw new Error(`The phone number ${to} is not registered on WhatsApp.`);
      }

      await this.client.sendMessage(numberDetails._serialized, message);
      this.logger.log(`WhatsApp message sent to ${to}: ${message}`);
    } catch (error) {
      this.logger.error(`Error sending WhatsApp message to ${to}:`, (error as Error).message);
      throw error; // Re-throw the error after logging
    }
  }

  // Disconnect the client and clean up
  async disconnect(): Promise<void> {
    if (!this.client) {
        this.logger.warn('Cannot disconnect: WhatsApp client was not created.');
        return;
    }
    try {
      this.logger.log('Disconnecting WhatsApp client...');
      await this.client.logout(); // Use logout for graceful disconnection
      this.isInitialized = false;
      this.logger.log('WhatsApp Web client disconnected.');
      // Note: Mongoose connection is typically managed globally or via NestJS module
    } catch (error) {
      this.logger.error('Error disconnecting WhatsApp client:', (error as Error).message);
    }
  }
}
