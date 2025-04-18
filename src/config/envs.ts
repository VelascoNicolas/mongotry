import 'dotenv/config';
import * as joi from 'joi';
const enVarsSchema = joi
  .object({
    PORT: joi.number().default(3000),
    NODE_ENV: joi
      .string()
      .valid('development', 'production')
      .default('development'),
    HOST: joi.string().default('localhost'),
    DB_PORT: joi.number().default(3306),
    JWT_SECRET: joi.string().required(),
    DB_USERNAME: joi.string().default('root'),
    DB_PASSWORD: joi.string().allow('').default(''),
    DB_NAME: joi.string(),
    SWAGGER_PATH: joi.string(),
    SWAGGER_PASSWORD: joi.string(),
    BLOB_READ_WRITE_TOKEN: joi.string().allow(),
    GOOGLE_CLIENT_ID: joi.string().allow(),
    GOOGLE_CLIENT_SECRET: joi.string().allow(),
    GOOGLE_CALLBACK_URL: joi.string().allow(),
    EMAIL_HOST: joi.string().allow(),
    EMAIL_PORT: joi.number().allow(),
    GOOGLE_USER: joi.string().allow(),
    GOOGLE_PASSWORD: joi.string().allow(),
    REDIS_PASSWORD: joi.string().allow(),
    REDIS_USERNAME: joi.string().allow(),
    REDIS_HOST: joi.string().allow(),
    REDIS_PORT: joi.number().allow(),
    WHATSAPP_ACCESS_TOKEN: joi.string().allow(),
    MONGODB_URI: joi.string().allow(),
  })
  .unknown()
  .required(); // unknown() permite que se añadan variables de entorno no definidas en el esquema
const { error, value: envVars } = enVarsSchema.validate(process.env);
if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}
//Intertfaz para las varialbes de entorno
interface EnvVars {
  PORT: number;
  NODE_ENV: string;
  HOST: string;
  DB_PORT: number;
  DB_USERNAME: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  JWT_SECRET: string;
  SWAGGER_PATH: string;
  SWAGGER_PASSWORD: string;
  BLOB_READ_WRITE_TOKEN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_CALLBACK_URL: string;
  EMAIL_HOST: string;
  EMAIL_PORT: number;
  GOOGLE_USER: string;
  GOOGLE_PASSWORD: string;
  REDIS_PASSWORD: string;
  REDIS_USERNAME: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  WHATSAPP_ACCESS_TOKEN: string;
  MONGODB_URI: string;
}
//Exportamos las envs validadas
export const envConfig: EnvVars = {
  PORT: envVars.PORT,
  NODE_ENV: envVars.NODE_ENV,
  HOST: envVars.HOST,
  DB_PORT: envVars.DB_PORT,
  DB_USERNAME: envVars.DB_USERNAME,
  DB_PASSWORD: envVars.DB_PASSWORD,
  DB_NAME: envVars.DB_NAME,
  JWT_SECRET: envVars.JWT_SECRET,
  SWAGGER_PATH: envVars.SWAGGER_PATH,
  SWAGGER_PASSWORD: envVars.SWAGGER_PASSWORD,
  BLOB_READ_WRITE_TOKEN: envVars.BLOB_READ_WRITE_TOKEN,
  GOOGLE_CLIENT_ID: envVars.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: envVars.GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL: envVars.GOOGLE_CALLBACK_URL,
  EMAIL_HOST: envVars.EMAIL_HOST,
  EMAIL_PORT: envVars.EMAIL_PORT,
  GOOGLE_USER: envVars.GOOGLE_USER,
  GOOGLE_PASSWORD: envVars.GOOGLE_PASSWORD,
  REDIS_PASSWORD: envVars.REDIS_PASSWORD,
  REDIS_USERNAME: envVars.REDIS_USERNAME,
  REDIS_HOST: envVars.REDIS_HOST,
  REDIS_PORT: envVars.REDIS_PORT,
  WHATSAPP_ACCESS_TOKEN: envVars.WHATSAPP_ACCESS_TOKEN,
  MONGODB_URI: envVars.MONGODB_URI,
};