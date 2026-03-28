// Seattle-area golf course configuration
// bookingSystem: 'chronogolf' | 'cps' | 'golfnow' | 'easytee'
export const COURSES = [
  // ── Seattle City Courses (Seattle Parks) ─────────────────────────────────
  {
    name: 'Jackson Park Golf Course',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'jackson-park-golf-club-washington',
    golfnowId: '17866',
    bookingUrl: 'https://www.chronogolf.com/club/jackson-park-golf-club-washington',
    city: 'Seattle',
    region: 'city',
    holes: 18,
  },
  {
    name: 'Jefferson Park Golf Course',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'jefferson-park-golf-course',
    golfnowId: '17867',
    bookingUrl: 'https://www.chronogolf.com/club/jefferson-park-golf-course',
    city: 'Seattle',
    region: 'city',
    holes: 18,
  },
  {
    name: 'West Seattle Golf Course',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'west-seattle-golf-course',
    golfnowId: '6498',
    bookingUrl: 'https://www.chronogolf.com/club/west-seattle-golf-course',
    city: 'Seattle',
    region: 'city',
    holes: 18,
  },
  {
    name: 'Interbay Golf Center',
    bookingSystem: 'cps',
    cpsSlug: 'interbay-golf-center',
    golfnowId: '17868',
    bookingUrl: 'https://premiergolf.cps.golf/reserve/interbay-golf-center',
    city: 'Seattle',
    region: 'city',
    holes: 9,
  },
  // ── North / Snohomish County ──────────────────────────────────────────────
  {
    name: 'Legion Memorial Golf Course',
    bookingSystem: 'cps',
    cpsSlug: 'legion-memorial-golf-course',
    bookingUrl: 'https://premiergolf.cps.golf/reserve/legion-memorial-golf-course',
    city: 'Everett',
    region: 'north',
    holes: 18,
  },
  {
    name: 'Walter E. Hall Memorial Golf Course',
    bookingSystem: 'golfnow',
    golfnowId: '4726',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/4726',
    city: 'Everett',
    region: 'north',
    holes: 18,
  },
  {
    name: 'Harbour Pointe Golf Club',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'harbour-pointe-golf-club',
    bookingUrl: 'https://www.chronogolf.com/club/harbour-pointe-golf-club',
    city: 'Mukilteo',
    region: 'north',
    holes: 18,
  },
  {
    name: 'Battle Creek Golf Course',
    bookingSystem: 'golfnow',
    golfnowId: '1679',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/1679',
    city: 'Marysville',
    region: 'north',
    holes: 18,
  },
  // ── Eastside ──────────────────────────────────────────────────────────────
  {
    name: 'Bellevue Golf Course',
    bookingSystem: 'cps',
    cpsSlug: 'bellevue-golf-course',
    golfnowId: '2936',
    bookingUrl: 'https://premiergolf.cps.golf/reserve/bellevue-golf-course',
    city: 'Bellevue',
    region: 'eastside',
    holes: 18,
  },
  {
    name: 'Willows Run Golf Complex',
    bookingSystem: 'golfnow',
    golfnowId: '7422',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/7422',
    city: 'Redmond',
    region: 'eastside',
    holes: 18,
  },
  {
    name: 'Redmond Ridge Golf Course',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'redmond-ridge-golf-course',
    bookingUrl: 'https://www.chronogolf.com/club/redmond-ridge-golf-course',
    city: 'Redmond',
    region: 'eastside',
    holes: 18,
  },
  {
    name: 'Golf Club at Newcastle',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'golf-club-at-newcastle',
    golfnowId: '3810',
    bookingUrl: 'https://www.chronogolf.com/club/golf-club-at-newcastle',
    city: 'Newcastle',
    region: 'eastside',
    holes: 18,
  },
  {
    name: 'Snoqualmie Falls Golf Course',
    bookingSystem: 'golfnow',
    golfnowId: '5555',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/5555',
    city: 'Snoqualmie',
    region: 'eastside',
    holes: 18,
  },
  {
    name: 'Tall Chief Golf Course',
    bookingSystem: 'golfnow',
    golfnowId: '7093',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/7093',
    city: 'Fall City',
    region: 'eastside',
    holes: 18,
  },
  // ── South / Kent / Auburn ─────────────────────────────────────────────────
  {
    name: 'Foster Golf Links',
    bookingSystem: 'golfnow',
    golfnowId: '4153',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/4153',
    city: 'Tukwila',
    region: 'south',
    holes: 18,
  },
  {
    name: 'Riverbend Golf Complex',
    bookingSystem: 'golfnow',
    golfnowId: '4154',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/4154',
    city: 'Kent',
    region: 'south',
    holes: 18,
  },
  {
    name: 'Maplewood Golf Course',
    bookingSystem: 'golfnow',
    golfnowId: '6607',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/6607',
    city: 'Renton',
    region: 'south',
    holes: 18,
  },
  {
    name: 'Washington National Golf Club',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'washington-national-golf-club',
    golfnowId: '7380',
    bookingUrl: 'https://www.chronogolf.com/club/washington-national-golf-club',
    city: 'Auburn',
    region: 'south',
    holes: 18,
  },
  {
    name: 'Auburn Golf Course',
    bookingSystem: 'golfnow',
    golfnowId: '1244',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/1244',
    city: 'Auburn',
    region: 'south',
    holes: 18,
  },
  {
    name: 'Druids Glen Golf Course',
    bookingSystem: 'golfnow',
    golfnowId: '19498',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/19498',
    city: 'Covington',
    region: 'south',
    holes: 18,
  },
  {
    name: 'Trophy Lake Golf & Casting',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'trophy-lake-golf-casting',
    bookingUrl: 'https://www.chronogolf.com/club/trophy-lake-golf-casting',
    city: 'Port Orchard',
    region: 'south',
    holes: 18,
  },
  {
    name: 'Madrona Links Golf Course',
    bookingSystem: 'golfnow',
    golfnowId: '4908',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/4908',
    city: 'Gig Harbor',
    region: 'south',
    holes: 18,
  },
  {
    name: 'Chambers Bay',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'chambers-bay-golf-club',
    golfnowId: '4231',
    bookingUrl: 'https://www.chronogolf.com/club/chambers-bay-golf-club',
    city: 'University Place',
    region: 'south',
    holes: 18,
  },
];

export function getCourseByName(name) {
  return COURSES.find(c => c.name === name);
}

export function getBookingUrl(courseName, date) {
  const course = getCourseByName(courseName);
  if (!course) return null;
  const base = course.bookingUrl;
  if (base.includes('chronogolf.com') || base.includes('golfnow.com')) {
    return `${base}#date=${date}`;
  }
  return base;
}

// Courses available for each tier
export const TIER_COURSE_LIMITS = {
  free: 1,
  premium: 3,
  all_access: 10,
};
