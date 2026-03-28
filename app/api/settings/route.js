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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { settings: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      tier: user.tier,
      settings: {
        ...user.settings,
        phone: user.phone, // Include phone from User model
        alertEmailAddress: user.settings?.alertEmailAddress || user.email,
      },
    });
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update phone on User model if provided
    if (data.phone !== undefined) {
      await prisma.user.update({
        where: { id: user.id },
        data: { phone: data.phone || null },
      });
    }

    const settings = await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: {
        courses: data.courses ?? [],
        selectedDates: data.selectedDates ?? [],
        dayOfWeek: data.dayOfWeek ?? ['saturday'],
        startTime: data.startTime ?? '07:00',
        endTime: data.endTime ?? '09:00',
        players: data.players ?? 4,
        alertEmail: data.alertEmail ?? true,
        alertSms: data.alertSms ?? false,
        alertEmailAddress: data.alertEmailAddress ?? null,
        alertFrequency: data.alertFrequency ?? 'instant',
        quietHoursStart: data.quietHoursStart ?? '22:00',
        quietHoursEnd: data.quietHoursEnd ?? '06:00',
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
      },
      create: {
        userId: user.id,
        courses: data.courses ?? [],
        selectedDates: data.selectedDates ?? [],
        dayOfWeek: data.dayOfWeek ?? ['saturday'],
        startTime: data.startTime ?? '07:00',
        endTime: data.endTime ?? '09:00',
        players: data.players ?? 4,
        alertEmail: data.alertEmail ?? true,
        alertSms: data.alertSms ?? false,
        alertEmailAddress: data.alertEmailAddress ?? null,
        alertFrequency: data.alertFrequency ?? 'instant',
        quietHoursStart: data.quietHoursStart ?? '22:00',
        quietHoursEnd: data.quietHoursEnd ?? '06:00',
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
      },
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Settings PUT error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
