import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const sqlHost = process.env.SQL_HOST || 'localhost';
const sqlPort = Number(process.env.SQL_PORT || '5432');
const sqlDbName = process.env.SQL_DB_NAME || 'doepet_db';
const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER || 'postgres';
const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || 'postgres';
const useSsl = process.env.SQL_SSL === 'true';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: {
    host: sqlHost,
    port: sqlPort,
    user,
    password,
    database: sqlDbName,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  },
  verbose: true,
});
