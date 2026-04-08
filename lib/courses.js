// Seattle-area golf course configuration
// bookingSystem: 'chronogolf' | 'cps' | 'golfnow'
// affiliationTypeId: required for Chronogolf API calls (visitor/public rate ID)
export const COURSES = [
  // ── Seattle City Courses (CPS / Premier Golf) ─────────────────────────────
  {
    name: 'Jackson Park Golf Course',
    bookingSystem: 'cps',
    cpsSlug: 'jackson-park-golf-course',
    bookingUrl: 'https://premiergolf.cps.golf/reserve/jackson-park-golf-course',
    city: 'Seattle',
    region: 'city',
    holes: 18,
  },
  {
    name: 'Jefferson Park Golf Course',
    bookingSystem: 'cps',
    cpsSlug: 'jefferson-park-golf-course',
    bookingUrl: 'https://premiergolf.cps.golf/reserve/jefferson-park-golf-course',
    city: 'Seattle',
    region: 'city',
    holes: 18,
  },
  {
    name: 'West Seattle Golf Course',
    bookingSystem: 'cps',
    cpsSlug: 'west-seattle-golf-course',
    bookingUrl: 'https://premiergolf.cps.golf/reserve/west-seattle-golf-course',
    city: 'Seattle',
    region: 'city',
    holes: 18,
  },
  {
    name: 'Interbay Golf Center',
    bookingSystem: 'cps',
    cpsSlug: 'interbay-golf-center',
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
    golfnowId: '17870',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/17870',
    city: 'Everett',
    region: 'north',
    holes: 18,
  },
  {
    name: 'Harbour Pointe Golf Club',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'harbour-pointe-golf-club',
    affiliationTypeId: 59698,
    bookingUrl: 'https://www.chronogolf.com/club/harbour-pointe-golf-club',
    city: 'Mukilteo',
    region: 'north',
    holes: 18,
  },
  // Battle Creek Golf Course (Marysville): GolfNow ID 1039750 is invalid (404).
  // No Chronogolf presence. No bookable online system identified. Removed.
  // ── Eastside ──────────────────────────────────────────────────────────────
  {
    name: 'Bellevue Golf Course',
    bookingSystem: 'cps',
    cpsSlug: 'bellevue-golf-course',
    bookingUrl: 'https://premiergolf.cps.golf/reserve/bellevue-golf-course',
    city: 'Bellevue',
    region: 'eastside',
    holes: 18,
  },
  {
    name: 'Willows Run Golf Complex',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'willows-run-golf-club',
    affiliationTypeId: 60402,
    bookingUrl: 'https://www.chronogolf.com/club/willows-run-golf-club',
    city: 'Redmond',
    region: 'eastside',
    holes: 18,
  },
  {
    name: 'Redmond Ridge Golf Course',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'trilogy-at-redmond-ridge',
    affiliationTypeId: 60306,
    bookingUrl: 'https://www.chronogolf.com/club/trilogy-at-redmond-ridge',
    city: 'Redmond',
    region: 'eastside',
    holes: 18,
  },
  {
    name: 'Golf Club at Newcastle',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'golf-club-at-newcastle',
    affiliationTypeId: 59674,
    bookingUrl: 'https://www.chronogolf.com/club/golf-club-at-newcastle',
    city: 'Newcastle',
    region: 'eastside',
    holes: 18,
  },
  {
    name: 'Snoqualmie Falls Golf Course',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'snoqualmie-falls-golf-course',
    affiliationTypeId: 60174,
    bookingUrl: 'https://www.chronogolf.com/club/snoqualmie-falls-golf-course',
    city: 'Snoqualmie',
    region: 'eastside',
    holes: 18,
  },
  // ── South / Kent / Auburn / Pierce County ────────────────────────────────
  {
    name: 'Foster Golf Links',
    bookingSystem: 'golfnow',
    golfnowId: '2525',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/2525',
    city: 'Tukwila',
    region: 'south',
    holes: 18,
  },
  {
    name: 'Riverbend Golf Complex',
    bookingSystem: 'golfnow',
    golfnowId: '679',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/679',
    city: 'Kent',
    region: 'south',
    holes: 18,
  },
  {
    name: 'Maplewood Golf Course',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'maplewood-golf-course-washington',
    affiliationTypeId: 59898,
    bookingUrl: 'https://www.chronogolf.com/club/maplewood-golf-course-washington',
    city: 'Renton',
    region: 'south',
    holes: 18,
  },
  {
    name: 'Washington National Golf Club',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'washington-national-golf-club',
    affiliationTypeId: 60362,
    bookingUrl: 'https://www.chronogolf.com/club/washington-national-golf-club',
    city: 'Auburn',
    region: 'south',
    holes: 18,
  },
  {
    name: 'Auburn Golf Course',
    bookingSystem: 'golfnow',
    golfnowId: '1636',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/1636',
    city: 'Auburn',
    region: 'south',
    holes: 18,
  },
  {
    name: 'Druids Glen Golf Course',
    bookingSystem: 'golfnow',
    golfnowId: '1252',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/1252',
    city: 'Covington',
    region: 'south',
    holes: 18,
  },
  // Trophy Lake Golf & Casting (Port Orchard): OKI Golf property with members-only Chronogolf.
  // No public Chronogolf slug found. Slug 'trophy-lake-golf-casting' returns 403/404. Removed.
  {
    name: 'Madrona Links Golf Course',
    bookingSystem: 'chronogolf',
    chronogolfSlug: 'madrona-links-golf-course',
    affiliationTypeId: 59886,
    bookingUrl: 'https://www.chronogolf.com/club/madrona-links-golf-course',
    city: 'Gig Harbor',
    region: 'south',
    holes: 18,
  },
  {
    name: 'Chambers Bay',
    bookingSystem: 'golfnow',
    golfnowId: '4231',
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/4231',
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
