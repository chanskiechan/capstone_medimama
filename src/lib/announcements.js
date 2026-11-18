import { today } from '../care';

const weekdayIndex = 3; // Wednesday

export function upcomingAnnouncementDates(count = 8) {
  const start = new Date(`${today()}T00:00:00Z`);
  const daysUntilNextWednesday = ((weekdayIndex - start.getUTCDay() + 7) % 7) || 7;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + daysUntilNextWednesday + index * 7);
    return date.toISOString().slice(0, 10);
  });
}

export function announcementTimeOptions() {
  return Array.from({ length: 18 }, (_, index) => `${String(8 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`);
}

export function announcementDateLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(new Date(`${value}T00:00:00+08:00`));
}

export function announcementTimeLabel(value) {
  if (!value) return '';
  const normalized = String(value).slice(0, 5);
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    // The stored time is a clinic-local time, so keep the clock value instead
    // of converting it through the browser's local timezone.
    timeZone: 'UTC',
  }).format(new Date(`1970-01-01T${normalized}:00Z`));
}

export function announcementScheduleLabel(date, time) {
  if (!date) return '';
  const when = announcementDateLabel(date);
  return time ? `${when} at ${announcementTimeLabel(time)}` : when;
}
