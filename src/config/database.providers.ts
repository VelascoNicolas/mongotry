import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { envConfig } from './envs';

export const databaseProviders: TypeOrmModuleOptions = {
  type: 'postgres',
  // type: 'mysql',
  host: envConfig.HOST,
  port: envConfig.DB_PORT || 3306,
  database: envConfig.DB_NAME,
  username: envConfig.DB_USERNAME,
  password: envConfig.DB_PASSWORD || '',
  autoLoadEntities: true, // Carga las entidades automáticamente
  synchronize: envConfig.NODE_ENV === 'development', // Sincroniza la base de datos con las entidades (no recomendado para producción)
  extra: {
    // Configuraciones del pool de conexiones
    max: envConfig.NODE_ENV === 'production' ? 20 : 5, // Máximo de conexiones
    connectionTimeoutMillis: 5000, // Timeout de conexión
    idleTimeoutMillis: 50000, // Cierra conexiones inactivas después de 50 segundos
    allowExitOnIdle: true, // Permite que el proceso de Node.js termine si no hay conexiones activas
  },
  ssl: { rejectUnauthorized: false },
};
