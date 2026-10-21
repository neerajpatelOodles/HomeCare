require('dotenv').config();

const required = ['JWT_ACCESS_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
  throw new Error('Set DATABASE_URL (or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME) in .env');
}

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: num(process.env.PORT, 5000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  db: {
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST,
    port: num(process.env.DB_PORT, 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessTtlMinutes: num(process.env.ACCESS_TOKEN_TTL_MINUTES, 15),
    refreshTtlDays: num(process.env.REFRESH_TOKEN_TTL_DAYS, 7),
    bcryptRounds: num(process.env.BCRYPT_ROUNDS, 12),
  },
  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@homecare.local',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
    firstName: process.env.SEED_ADMIN_FIRST_NAME || 'System',
    lastName: process.env.SEED_ADMIN_LAST_NAME || 'Admin',
  },
};
