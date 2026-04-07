import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '../../../../lib/prisma';
import { sendEmailAlert, sendSmsAlert } from '../../../../lib/alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function POST(request) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { method } = await request.json();

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { settings: true },
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Sample tee time for the test
    const testTeeTimes = [{
      course: 'Harbour Pointe Golf Club',
      date: 'Sat, Apr 12',
      time: '8:30 AM',
      players: 4,
      price: '$65.00',
      holes: 18,
      bookingUrl: 'https://www.chronogolf.com/club/harbour-pointe-golf-club',
    }];

    if (method === 'email') {
      const email = user.settings?.alertEmailAddress || user.email;
      if (!email) return NextResponse.json({ error: 'No email address on file' }, { status: 400 });
      const sent = await sendEmailAlert(email, testTeeTimes);
      if (sent) return NextResponse.json({ sent: true, to: email });
      return NextResponse.json({ error: 'Email failed — check Resend config in Vercel env vars' }, { status: 500 });
    }

    if (method === 'sms') {
      if (user.tier === 'free') return NextResponse.json({ error: 'SMS alerts require Premium or All Access' }, { status: 403 });
      if (!user.phone) return NextResponse.json({ error: 'Add a phone number in your profile first' }, { status: 400 });
      const sent = await sendSmsAlert(user.phone, testTeeTimes);
      if (sent) return NextResponse.json({ sent: true, to: user.phone });
      return NextResponse.json({ error: 'SMS failed — check Twilio config in Vercel env vars' }, { status: 500 });
    }

    return NextResponse.json({ error: 'Invalid method — use "email" or "sms"' }, { status: 400 });
  } catch (error) {
    console.error('Test alert error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
