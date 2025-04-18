import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Client, NoAuth } from 'whatsapp-web.js';
import chromium from '@sparticuz/chromium-min'; // Ensure this is installed

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private client: Client;
  private readonly logger = new Logger(WhatsAppService.name);
  private isInitialized = false;

  constructor(private eventEmitter: EventEmitter2) {}

  async onModuleInit() {
    if (this.isInitialized) {
      this.logger.warn('Attempted to initialize WhatsApp service multiple times.');
      return;
    }

    // Default to undefined, suitable for local Puppeteer default
    let executablePath: string | undefined = undefined;
    // Default args suitable for local
    let puppeteerArgs: string[] = ['--no-sandbox'];
    let isProduction = process.env.NODE_ENV === 'production';


    if (isProduction) {
        this.logger.log('Vercel/Production environment detected. Attempting to use @sparticuz/chromium-min.');
        try {
          // Explicitly pass no arguments to executablePath to ensure it uses its default runtime logic
          this.logger.log('Calling chromium.executablePath()...');
          executablePath = await chromium.executablePath(); // <= This is where the error occurs
          this.logger.log(`@sparticuz/chromium-min executablePath resolved to: ${executablePath}`);

          // Use recommended args from sparticuz in production
          puppeteerArgs = [
            ...chromium.args,
            '--no-sandbox', // Ensure sandbox disabled
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process',
            '--no-zygote',
            '--disable-gpu'
          ];
          this.logger.log(`Using production puppeteer args: ${puppeteerArgs.join(' ')}`);

        } catch (sparticuzError) {
          this.logger.error('Failed during @sparticuz/chromium-min setup:', sparticuzError);
          // If sparticuz fails, we cannot proceed in production
          executablePath = undefined; // Mark as failed
          this.logger.error('Cannot proceed with @sparticuz/chromium-min. Initialization aborted.');
          return; // Stop initialization
        }
    } else {
        this.logger.log('Local environment detected. Using Puppeteer default browser.');
        // executablePath remains undefined
        // puppeteerArgs remain simple for local
    }

    // --- Proceed with Client Initialization ---
    try {
      this.logger.log(`Final executable path: ${executablePath || 'Puppeteer default'}`);
      this.logger.log(`Final Puppeteer args: ${puppeteerArgs.join(' ')}`);

      this.client = new Client({
        authStrategy: new NoAuth(),
        puppeteer: {
          // Use sparticuz headless value in prod, true locally
          headless: isProduction ? chromium.headless : true,
          args: puppeteerArgs,
          executablePath: executablePath, // Set conditionally
        },
      });
      this.logger.log('WhatsApp Client configured.');

      // --- Setup Listeners ---
      this.client.on('qr', (qr) => {
        this.logger.log('QR Code received');
        this.eventEmitter.emit('qrcode.created', qr);
      });
      this.client.on('ready', () => {
        this.logger.log('WhatsApp Web client is ready!');
      });
      this.client.on('auth_failure', (msg) => {
          this.logger.error('WhatsApp authentication failure:', msg);
      });
      this.client.on('disconnected', (reason) => {
          this.logger.warn('WhatsApp client disconnected:', reason);
          this.isInitialized = false;
      });
      // --- End Listeners ---

      // --- Initialize Client ---
      this.logger.log('Initializing WhatsApp client...');
      await this.client.initialize();
      this.isInitialized = true;
      this.logger.log('WhatsApp client initialized successfully.');
      // --- End Initialize ---

    } catch (error) {
      // This catch block handles errors during Client creation or initialize()
      this.logger.error('Failed during WhatsApp client creation or initialization:', error);
      this.isInitialized = false;
    }
  }

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

  async disconnect(): Promise<void> {
    if (!this.client) {
        this.logger.warn('Cannot disconnect: WhatsApp client was not created.');
        return;
    }
    try {
      this.logger.log('Disconnecting WhatsApp client...');
      await this.client.destroy(); // Use destroy with NoAuth
      this.isInitialized = false;
      this.logger.log('WhatsApp Web client disconnected.');
    } catch (error) {
      this.logger.error('Error disconnecting WhatsApp client:', (error as Error).message);
    }
  }
}
