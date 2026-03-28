// Seattle-area golf course configuration
export const COURSES = [
  {
    name: 'Jackson Park Golf Course',
    golfnowId: '17866',
    chronogolfSlug: 'jackson-park-golf-club-washington',
    bookingUrl: 'https://www.chronogolf.com/club/jackson-park-golf-club-washington',
    city: 'Seattle',
    region: 'city',
  },
  {
    name: 'Jefferson Park Golf Course',
    golfnowId: '17867',
    chronogolfSlug: 'jefferson-park-golf-club',
    bookingUrl: 'https://www.chronogolf.com/club/jefferson-park-golf-club',
    city: 'Seattle',
    region: 'city',
  },
  {
    name: 'West Seattle Golf Course',
    golfnowId: '6498',
    chronogolfSlug: 'west-seattle-golf-course',
    bookingUrl: 'https://www.chronogolf.com/club/west-seattle-golf-course',
    city: 'Seattle',
    region: 'city',
  },
  {
    name: 'Interbay Golf Center',
    golfnowId: '17868',
    chronogolfSlug: null,
    bookingUrl: 'https://www.chronogolf.com/club/interbay-golf-center',
    city: 'Seattle',
    region: 'city',
  },
  {
    name: 'Bellevue Golf Course',
    golfnowId: '2936',
    chronogolfSlug: null,
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/2936-bellevue-golf-course/search',
    city: 'Bellevue',
    region: 'eastside',
  },
  {
    name: 'Willows Run Golf Complex',
    golfnowId: '7422',
    chronogolfSlug: null,
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/7422-willows-run-golf-complex/search',
    city: 'Redmond',
    region: 'eastside',
  },
  {
    name: 'Druids Glen Golf Course',
    golfnowId: '19498',
    chronogolfSlug: null,
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/19498-druids-glen-golf-course/search',
    city: 'Covington',
    region: 'south',
  },
  {
    name: 'The Golf Club at Newcastle',
    golfnowId: '3810',
    chronogolfSlug: null,
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/3810-the-golf-club-at-newcastle/search',
    city: 'Newcastle',
    region: 'eastside',
  },
  {
    name: 'Washington National Golf Club',
    golfnowId: '7380',
    chronogolfSlug: null,
    bookingUrl: 'https://www.golfnow.com/tee-times/facility/7380-washington-national-golf-club/search',
    city: 'Auburn',
    region: 'south',
  },
  {
    name: 'Chambers Bay',
    golfnowId: '4231',
    chronogolfSlug: 'chambers-bay-golf-club',
    bookingUrl: 'https://www.chronogolf.com/club/chambers-bay-golf-club',
    city: 'University Place',
    region: 'south',
  },
];

export function getCourseByName(name) {
  return COURSES.find(c => c.name === name);
}

export function getBookingUrl(courseName, date) {
  const course = getCourseByName(courseName);
  if (!course) return null;
  // Append date param where possible
  const base = course.bookingUrl;
  if (base.includes('chronogolf.com')) {
    return `${base}#date=${date}`;
  }
  if (base.includes('golfnow.com')) {
    return `${base}#date=${date}`;
  }
  return base;
}
