import { COURSES } from './courses.js';

// Scrape tee times from GolfNow for a specific course and date
async function scrapeGolfNow(course, date, players = 4) {
  const teeTimes = [];
  
  try {
    // GolfNow uses a POST endpoint for tee time results
    const url = `https://www.golfnow.com/api/tee-times/tee-time-results`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Referer': `https://www.golfnow.com/tee-times/facility/${course.golfnowId}/search`,
        'Origin': 'https://www.golfnow.com',
      },
      body: JSON.stringify({
        FacilityId: parseInt(course.golfnowId),
        Date: date,
        Players: players,
        Holes: 0, // 0 = any
        PriceMin: 0,
        PriceMax: 10000,
        SortBy: 'Date',
        SortByRollup: 'Date',
        View: 'Grouping',
        ExcludeFeaturedDeals: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.log(`GolfNow ${course.name} (${date}): HTTP ${res.status}`);
      return teeTimes;
    }

    const data = await res.json();
    
    // Parse the response - GolfNow returns tee times in various structures
    const results = data?.TeeTimeResults || data?.ttResults || data?.Results || 
                    data?.teeTimeResults || data?.results || [];
    
    if (Array.isArray(results)) {
      for (const tt of results) {
        const time = tt.Time || tt.time || tt.teeTime || tt.StartTime || '';
        const price = tt.DisplayRate || tt.Price || tt.price || tt.DisplayPrice || 
                      tt.GreenFee || tt.greenFee || '';
        const holes = tt.Holes || tt.holes || 18;
        const spots = tt.PlayerRule?.MaxPlayers || tt.MaxPlayers || tt.maxPlayers || 
                      tt.AvailableSpots || players;
        
        // Handle nested rates array
        const rates = tt.Rates || tt.rates || [];
        const bestRate = rates[0];
        const ratePrice = bestRate?.DisplayRate || bestRate?.Price || bestRate?.price || price;
        
        const timeStr = typeof time === 'string' ? time : '';
        
        if (timeStr) {
          teeTimes.push({
            course: course.name,
            date: date,
            time: formatTime(timeStr),
            players: spots,
            price: typeof ratePrice === 'number' ? `$${ratePrice.toFixed(2)}` : 
                   (typeof ratePrice === 'string' && ratePrice) ? 
                   (ratePrice.startsWith('$') ? ratePrice : `$${ratePrice}`) : 'N/A',
            holes: holes,
            bookingUrl: `https://www.golfnow.com/tee-times/facility/${course.golfnowId}/search#date=${date}`,
            source: 'golfnow',
          });
        }
      }
    }
    
    console.log(`GolfNow ${course.name} (${date}): found ${teeTimes.length} tee times`);
  } catch (error) {
    console.log(`GolfNow scrape error for ${course.name} (${date}): ${error.message}`);
  }

  return teeTimes;
}

// Fallback: scrape from GolfNow's HTML search page 
async function scrapeGolfNowHtml(course, date, players = 4) {
  const teeTimes = [];
  
  try {
    const url = `https://www.golfnow.com/tee-times/facility/${course.golfnowId}-${course.name.toLowerCase().replace(/\s+/g, '-')}/search#date=${date}&players=${players}`;
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return teeTimes;

    const html = await res.text();
    
    // Extract tee time data from embedded JSON in the page
    const jsonMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/s) ||
                      html.match(/"teeTimeResults"\s*:\s*(\[.*?\])/s);
    
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        const results = data?.teeTimeResults || data?.ttResults || (Array.isArray(data) ? data : []);
        
        for (const tt of results) {
          if (tt.time || tt.teeTime) {
            teeTimes.push({
              course: course.name,
              date: date,
              time: tt.time || tt.teeTime || '',
              players: tt.maxPlayers || players,
              price: tt.price ? `$${tt.price}` : 'N/A',
              holes: tt.holes || 18,
              bookingUrl: url,
              source: 'golfnow',
            });
          }
        }
      } catch (e) {
        // JSON parse failed
      }
    }
  } catch (error) {
    console.log(`GolfNow HTML scrape error for ${course.name}: ${error.message}`);
  }

  return teeTimes;
}

// Scrape Chronogolf for Seattle city courses
async function scrapeChronogolf(course, date, players = 4) {
  const teeTimes = [];
  if (!course.chronogolfSlug) return teeTimes;

  try {
    // Chronogolf API endpoint for tee time availability
    const url = `https://www.chronogolf.com/marketplace/clubs/${course.chronogolfSlug}/teetimes` +
      `?date=${date}&nb_holes=18&affiliation_type_ids=`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.log(`Chronogolf ${course.name} (${date}): HTTP ${res.status}`);
      return teeTimes;
    }

    const data = await res.json();
    const slots = data?.teetimes || data?.slots || data || [];

    if (Array.isArray(slots)) {
      for (const slot of slots) {
        const time = slot.start_time || slot.time || slot.teetime || '';
        const price = slot.green_fee || slot.price || slot.rate || '';
        const spots = slot.available_spots || slot.spots || 4;

        if (time && spots >= players) {
          teeTimes.push({
            course: course.name,
            date: date,
            time: formatChronogolfTime(time),
            players: spots,
            price: price ? `$${parseFloat(price).toFixed(2)}` : 'N/A',
            holes: slot.nb_holes || 18,
            bookingUrl: `https://www.chronogolf.com/club/${course.chronogolfSlug}#date=${date}`,
            source: 'chronogolf',
          });
        }
      }
    }
  } catch (error) {
    console.log(`Chronogolf scrape error for ${course.name}: ${error.message}`);
  }

  return teeTimes;
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  // Handle various time formats
  if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  // HH:MM format
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatChronogolfTime(timeStr) {
  if (!timeStr) return '';
  // Chronogolf times might be ISO or HH:MM
  if (timeStr.includes('T')) {
    return new Date(timeStr).toLocaleTimeString('en-US', { 
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles'
    });
  }
  return formatTime(timeStr);
}

// Generate dates between start and end (inclusive)
function getDateRange(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// Main scrape function: scrapes all specified courses for a date range
export async function scrapeTeeTimes(courseNames, startDate, endDate, players = 4) {
  const allTeeTimes = [];
  const dates = getDateRange(startDate, endDate);
  const coursesToScrape = COURSES.filter(c => courseNames.includes(c.name));

  console.log(`Scraping ${coursesToScrape.length} courses for ${dates.length} dates...`);

  // Process sequentially with small delays to avoid rate limiting
  for (const course of coursesToScrape) {
    for (const date of dates) {
      try {
        // Try GolfNow first
        let results = await scrapeGolfNow(course, date, players);
        
        // If no GolfNow results, try Chronogolf
        if (results.length === 0 && course.chronogolfSlug) {
          results = await scrapeChronogolf(course, date, players);
        }
        
        allTeeTimes.push(...results);
        
        // Small delay between requests
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        console.log(`Error scraping ${course.name} for ${date}: ${e.message}`);
      }
    }
  }

  console.log(`Found ${allTeeTimes.length} tee times total`);
  return allTeeTimes;
}
