export const HCM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const OFFSET_SUFFIX_PATTERN = /(Z|[+-]\d{2}:\d{2})$/i;

const hcmFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: HCM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  hourCycle: 'h23',
});

const formatDateAsHcmWallClock = (date: Date): string => {
  const parts = hcmFormatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
};

export const toHcmWallClockTimestamp = (value: string): string => {
  const trimmed = value.trim();

  if (!OFFSET_SUFFIX_PATTERN.test(trimmed)) {
    return trimmed.replace('T', ' ').replace(/\.\d{1,3}$/, '').slice(0, 19);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid datetime: ${value}`);
  }

  return formatDateAsHcmWallClock(parsed);
};

export const addMinutesToHcmWallClockTimestamp = (value: string, minutes: number): string => {
  const wallClock = toHcmWallClockTimestamp(value);
  const parsed = new Date(`${wallClock.replace(' ', 'T')}+07:00`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid HCM wall-clock datetime: ${value}`);
  }

  return formatDateAsHcmWallClock(new Date(parsed.getTime() + minutes * 60 * 1000));
};
