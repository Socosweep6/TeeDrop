import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  
  if (secret !== (process.env.CRON_SECRET || 'teedrop-cron-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Clean up past tee times
    const today = new Date().toISOString().split('T')[0];
    const deleted = await prisma.teeTime.deleteMany({
      where: { date: { lt: today } },
    });

    // Count current tee times
    const total = await prisma.teeTime.count();

    // If no tee times exist, seed with sample data for testing
    if (total === 0 && searchParams.get('seed') === 'true') {
      const sampleTeeTimes = generateSampleData();
      for (const tt of sampleTeeTimes) {
        await prisma.teeTime.create({ data: tt });
      }
      return NextResponse.json({
        message: 'Seeded sample data',
        cleaned: deleted.count,
        seeded: sampleTeeTimes.length,
      });
    }

    return NextResponse.json({
      message: 'Cron complete',
      cleaned: deleted.count,
      activeTeetimes: total,
      note: 'Tee times are populated via /api/ingest from the Mini PC scraper',
    });
  } catch (error) {
    console.error('Cron error:', error);
    return NextResponse.json(
      { error: 'Cron failed', details: error.message },
      { status: 500 }
    );
  }
}

function generateSampleData() {
  const courses = [
    'Jackson Park Golf Course',
    'Jefferson Park Golf Course',
    'West Seattle Golf Course',
    'Interbay Golf Center',
    'Bellevue Golf Course',
  ];
  const times = ['6:30 AM', '7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM'];
  const prices = ['$35.00', '$38.00', '$42.00', '$45.00', '$48.00', '$52.00', '$55.00'];
  const samples = [];

  for (let d = 0; d < 7; d++) {
    const date = new Date();
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().split('T')[0];

    for (const course of courses) {
      // 3-6 random tee times per course per day
      const count = 3 + Math.floor(Math.random() * 4);
      const shuffled = [...times].sort(() => Math.random() - 0.5).slice(0, count);
      
      for (const time of shuffled) {
        samples.push({
          course,
          date: dateStr,
          time,
          players: [2, 3, 4][Math.floor(Math.random() * 3)],
          price: prices[Math.floor(Math.random() * prices.length)],
          holes: 18,
          bookingUrl: `https://www.chronogolf.com/club/${course.toLowerCase().replace(/\s+/g, '-')}`,
          source: 'sample',
        });
      }
    }
  }
  return samples;
}
