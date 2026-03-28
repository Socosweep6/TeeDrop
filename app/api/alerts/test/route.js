import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '../../../../lib/prisma';
import { sendSmsAlert, sendEmailAlert } from '../../../../lib/alerts';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { settings: true },
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { method } = await request.json(); // 'email' or 'sms'

    const testTeeTime = [{
      course: 'Jackson Park Golf Course',
      date: new Date().toISOString().split('T')[0],
      time: '8:00 AM',
      players: 4,
      price: '$45.00',
      bookingUrl: 'https://www.chronogolf.com/club/jackson-park-golf-club-washington',
    }];

    if (method === 'sms') {
      if (!user.phone) {
        return NextResponse.json({ error: 'No phone number on file. Add one in Settings.' }, { status: 400 });
      }
      if (user.tier === 'free') {
        return NextResponse.json({ error: 'SMS alerts are a Premium feature.' }, { status: 403 });
      }
      const sent = await sendSmsAlert(user.phone, testTeeTime);
      return NextResponse.json({ sent, method: 'sms', to: user.phone });
    }

    if (method === 'email') {
      const email = user.settings?.alertEmailAddress || user.email;
      const sent = await sendEmailAlert(email, testTeeTime);
      return NextResponse.json({ sent, method: 'email', to: email });
    }

    return NextResponse.json({ error: 'Specify method: email or sms' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
