import { getBookingUrl } from './courses.js';

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
  const header = `⛳ TeeDrop Alert!\n${teeTimes.length} tee time${teeTimes.length > 1 ? 's' : ''} found:\n`;
  
  const lines = teeTimes.slice(0, 3).map(tt => {
    const bookUrl = tt.booking_url || tt.bookingUrl || getBookingUrl(tt.course, tt.date) || '';
    return `\n${tt.course}\n${tt.date} at ${tt.time} • ${tt.players}p • ${tt.price}${bookUrl ? `\nBook: ${bookUrl}` : ''}`;
  });

  const footer = teeTimes.length > 3 
    ? `\n\n+${teeTimes.length - 3} more — check the app!` 
    : '\n\nBook fast before they\'re gone!';

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
    return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 12px 0;">
          <strong style="color: #111;">${tt.course}</strong><br>
          <span style="color: #666; font-size: 14px;">
            ${tt.date} at ${tt.time} • ${tt.players} players • ${tt.price}
          </span><br>
          <a href="${bookUrl}" style="display: inline-block; margin-top: 8px; padding: 8px 16px; background: #16a34a; color: white; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600;">
            Book Now →
          </a>
        </td>
      </tr>`;
  }).join('');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 500px; margin: 0 auto;">
      <div style="padding: 20px 0; text-align: center;">
        <span style="font-size: 32px;">⛳</span>
        <h1 style="margin: 8px 0 4px; font-size: 22px; color: #111;">TeeDrop Alert</h1>
        <p style="margin: 0; color: #666; font-size: 14px;">
          ${teeTimes.length} tee time${teeTimes.length > 1 ? 's' : ''} matching your preferences
        </p>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        ${rows}
      </table>
      ${teeTimes.length > 10 ? `<p style="color: #666; font-size: 13px; text-align: center; padding: 16px 0;">+${teeTimes.length - 10} more available — check the app</p>` : ''}
      <div style="text-align: center; padding: 24px 0; border-top: 1px solid #eee; margin-top: 16px;">
        <p style="color: #999; font-size: 12px;">
          You're receiving this because you enabled alerts on TeeDrop.<br>
          Manage your preferences in the app settings.
        </p>
      </div>
    </div>`;

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
        subject: `⛳ ${teeTimes.length} tee time${teeTimes.length > 1 ? 's' : ''} available — TeeDrop Alert`,
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
