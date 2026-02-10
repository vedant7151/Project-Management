// config/prisma.js  (or prisma.js in your uploaded files)
import 'dotenv/config'
import pkg from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

const { PrismaClient } = pkg
// neonConfig.webSocketConstructor = ws

// const connectionString = process.env.DATABASE_URL
// const adapter = new PrismaNeon({ connectionString })

// Use standard PrismaClient for valid Railway deployment (TCP connection)
const prisma = global.prisma || new PrismaClient()

if (process.env.NODE_ENV === 'development') global.prisma = prisma

export default prisma
