import { previewHolidayCalendar } from './holiday-calendar';

export function countConfiguredHolidayDays(input: Parameters<typeof previewHolidayCalendar>[0]): number {
  return previewHolidayCalendar(input).filter(day => day.holidays.length > 0).length;
}
