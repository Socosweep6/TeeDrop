import { getBookingUrl } from './courses.js';

function formatAlertDate(dateStr) {
  if (!dateStr) return dateStr;
  // Already formatted (e.g. "Sun, Apr 12") — return as-is
  if (dateStr.includes(',') || dateStr.includes(' ')) return dateStr;
  // Raw ISO date (e.g. "2026-04-12") — format it
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Send SMS alerts via Twilio when new tee times match user preferences
export async function sendSmsAlert(phoneNumber, teeTimes) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.log('Twilio not configured - skipping SMS alert');
    return false;
  }

  if (!phoneNumber || teeTimes.length === 0) return false;

  // Build message body with booking links
  const header = `⛳ TeeDrop — ${teeTimes.length} tee time${teeTimes.length > 1 ? 's' : ''} just opened:\n`;
  
  const lines = teeTimes.slice(0, 3).map(tt => {
    const bookUrl = tt.booking_url || tt.bookingUrl || getBookingUrl(tt.course, tt.date) || '';
    const displayDate = formatAlertDate(tt.date);
    return `\n${tt.course}\n${displayDate} at ${tt.time} · ${tt.players}p${tt.price && tt.price !== 'N/A' ? ` · ${tt.price}` : ''}\n${bookUrl ? `Book: ${bookUrl}` : ''}`;
  });

  const footer = teeTimes.length > 3
    ? `\n\n+${teeTimes.length - 3} more — open TeeDrop to see all`
    : '\n\nBook fast — these go quick.';

  const body = header + lines.join('') + footer;

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phoneNumber,
        From: fromNumber,
        Body: body,
      }),
    });

    const data = await res.json();
    
    if (data.sid) {
      console.log(`SMS sent to ${phoneNumber}: ${data.sid}`);
      return true;
    } else {
      console.error('Twilio error:', data.message || data);
      return false;
    }
  } catch (error) {
    console.error('SMS send error:', error.message);
    return false;
  }
}

// Send email alert (using Resend API or basic SMTP-like service)
export async function sendEmailAlert(emailAddress, teeTimes) {
  const resendApiKey = process.env.RESEND_API_KEY;
  
  if (!resendApiKey) {
    console.log('Resend not configured - skipping email alert');
    return false;
  }

  if (!emailAddress || teeTimes.length === 0) return false;

  // Build HTML email body with booking links
  const rows = teeTimes.slice(0, 10).map(tt => {
    const bookUrl = tt.booking_url || tt.bookingUrl || getBookingUrl(tt.course, tt.date) || '#';
    const displayDate = formatAlertDate(tt.date);
    const showPrice = tt.price && tt.price !== 'N/A';
    return `
      <div style="margin-bottom:14px;padding:16px 20px;background:#f8faf6;border:1px solid #e2e8df;border-radius:12px;">
        <div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:8px;">${tt.course}</div>
        <div style="font-size:13px;color:#4b5563;line-height:1.8;">
          📅 ${displayDate}&nbsp;&nbsp;⏰ ${tt.time}&nbsp;&nbsp;👥 ${tt.players}p${tt.holes ? `&nbsp;&nbsp;⛳ ${tt.holes}h` : ''}${showPrice ? `&nbsp;&nbsp;<strong style="color:#16a34a;">${tt.price}</strong>` : ''}
        </div>
        <a href="${bookUrl}" style="display:inline-block;margin-top:14px;padding:10px 22px;background:#16a34a;color:#ffffff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:0.2px;">
          Book Now →
        </a>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f2;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="background:#0f4c2a;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
      <div style="font-size:28px;margin-bottom:10px;">⛳</div>
      <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">TeeDrop</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:4px;letter-spacing:0.3px;">TEE TIME ALERT</div>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:28px 32px;border:1px solid #e2e8df;border-top:none;">

      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 24px;">
        <strong style="color:#111827;">${teeTimes.length} tee time${teeTimes.length > 1 ? 's' : ''}</strong> matching your preferences just opened up.
      </p>

      ${rows}

      ${teeTimes.length > 10 ? `<p style="font-size:13px;color:#9ca3af;text-align:center;margin:20px 0 0;padding-top:16px;border-top:1px solid #f0f0ee;">+${teeTimes.length - 10} more available — open the app to see all</p>` : ''}

      <!-- Footer -->
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #f0f0ee;text-align:center;">
        <p style="font-size:12px;color:#9ca3af;line-height:1.7;margin:0;">
          You have tee time alerts active on TeeDrop.<br>
          <a href="https://teedrop.app/settings" style="color:#16a34a;text-decoration:none;">Manage preferences</a> · <a href="https://teedrop.app/dashboard" style="color:#16a34a;text-decoration:none;">View all times</a>
        </p>
      </div>
    </div>

  </div>
</body>
</html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'TeeDrop <alerts@teedrop.app>',
        to: emailAddress,
        subject: `⛳ ${teeTimes.length} tee time${teeTimes.length > 1 ? 's' : ''} just opened — TeeDrop`,
        html: html,
      }),
    });

    const data = await res.json();
    
    if (data.id) {
      console.log(`Email sent to ${emailAddress}: ${data.id}`);
      return true;
    } else {
      console.error('Resend error:', data);
      return false;
    }
  } catch (error) {
    console.error('Email send error:', error.message);
    return false;
  }
}

// Check if a tee time matches user settings
export function matchesUserPreferences(teeTime, settings) {
  if (settings.courses?.length > 0 && !settings.courses.includes(teeTime.course)) {
    return false;
  }

  // Check selected specific dates first, then fall back to date range
  if (settings.selectedDates?.length > 0) {
    if (!settings.selectedDates.includes(teeTime.date)) return false;
  } else {
    if (settings.startDate && teeTime.date < settings.startDate) return false;
    if (settings.endDate && teeTime.date > settings.endDate) return false;
  }

  if (settings.startTime && settings.endTime) {
    const ttTime = convertTo24h(teeTime.time);
    if (ttTime && (ttTime < settings.startTime || ttTime > settings.endTime)) {
      return false;
    }
  }

  if (settings.players && teeTime.players < settings.players) {
    return false;
  }

  return true;
}

// Check if current time is within quiet hours
export function isQuietHours(settings) {
  if (!settings.quietHoursStart || !settings.quietHoursEnd) return false;
  
  const now = new Date();
  const hours = now.toLocaleTimeString('en-US', { 
    hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles' 
  });
  
  const start = settings.quietHoursStart;
  const end = settings.quietHoursEnd;
  
  // Handle overnight quiet hours (e.g., 22:00 - 06:00)
  if (start > end) {
    return hours >= start || hours < end;
  }
  return hours >= start && hours < end;
}

function convertTo24h(timeStr) {
  if (!timeStr) return null;
  if (!timeStr.includes('AM') && !timeStr.includes('PM')) return timeStr;
  
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  
  let [_, h, m, ampm] = match;
  h = parseInt(h);
  if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12;
  if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
  
  return `${String(h).padStart(2, '0')}:${m}`;
}
