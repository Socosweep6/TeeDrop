import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '../../../lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const alerts = await prisma.alert.findMany({
      where: { userId: user.id },
      include: {
        teeTime: {
          select: { course: true, date: true, time: true, price: true, bookingUrl: true },
        },
      },
      orderBy: { sentAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      alerts: alerts.map(a => ({
        id: a.id,
        method: a.method,
        sentAt: a.sentAt,
        course: a.teeTime.course,
        date: a.teeTime.date,
        time: a.teeTime.time,
        price: a.teeTime.price,
        bookingUrl: a.teeTime.bookingUrl,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
