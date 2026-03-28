import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  if (key !== 'teedrop-setup-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Run raw SQL to create tables if they don't exist
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "password" TEXT NOT NULL,
        "phone" TEXT,
        "tier" TEXT NOT NULL DEFAULT 'free',
        "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "User_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "UserSettings" (
        "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
        "userId" TEXT NOT NULL,
        "courses" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "selectedDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "dayOfWeek" TEXT[] DEFAULT ARRAY['saturday']::TEXT[],
        "startTime" TEXT NOT NULL DEFAULT '07:00',
        "endTime" TEXT NOT NULL DEFAULT '09:00',
        "players" INTEGER NOT NULL DEFAULT 4,
        "alertEmail" BOOLEAN NOT NULL DEFAULT true,
        "alertSms" BOOLEAN NOT NULL DEFAULT false,
        "alertEmailAddress" TEXT,
        "alertFrequency" TEXT NOT NULL DEFAULT 'instant',
        "quietHoursStart" TEXT DEFAULT '22:00',
        "quietHoursEnd" TEXT DEFAULT '06:00',
        "startDate" TEXT,
        "endDate" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UserSettings_userId_key" ON "UserSettings"("userId");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // TeeTime table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TeeTime" (
        "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
        "course" TEXT NOT NULL,
        "date" TEXT NOT NULL,
        "time" TEXT NOT NULL,
        "players" INTEGER NOT NULL DEFAULT 4,
        "price" TEXT,
        "holes" INTEGER DEFAULT 18,
        "bookingUrl" TEXT,
        "source" TEXT DEFAULT 'golfnow',
        "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TeeTime_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TeeTime_course_date_idx" ON "TeeTime"("course", "date");`);

    // Alert table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Alert" (
        "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
        "userId" TEXT NOT NULL,
        "teeTimeId" TEXT NOT NULL,
        "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "method" TEXT NOT NULL DEFAULT 'sms',
        CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Alert_userId_idx" ON "Alert"("userId");`);
    
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "Alert" ADD CONSTRAINT "Alert_teeTimeId_fkey"
        FOREIGN KEY ("teeTimeId") REFERENCES "TeeTime"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    return NextResponse.json({ message: 'Database setup complete! Tables created successfully.' });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json({ error: 'Setup failed', details: error.message }, { status: 500 });
  }
}
