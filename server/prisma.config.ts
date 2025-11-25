import 'dotenv/config'
import { defineConfig, env } from '@prisma/config'


export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // For migrations / introspection, Prisma expects the DB connection here.
    // Prefer DIRECT_URL for direct (unpooled) access if you have it, otherwise fall back to DATABASE_URL
    url: env('DIRECT_URL') || env('DATABASE_URL'),
    // If you use shadow DB for migrations, you can add:
    // shadowDatabaseUrl: env('SHADOW_DATABASE_URL'),
  },
})
