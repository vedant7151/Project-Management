// config/prisma.js  (or prisma.js in your uploaded files)
import 'dotenv/config'
// import pkg from '@prisma/client'
// const { PrismaClient } = pkg

import { PrismaNeon } from '@prisma/adapter-neon'
import { neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

neonConfig.webSocketConstructor = ws

const connectionString = process.env.DATABASE_URL
const adapter = new PrismaNeon({ connectionString })

const prisma = global.prisma || new PrismaClient({ adapter })

if (process.env.NODE_ENV === 'development') global.prisma = prisma

export default prisma
