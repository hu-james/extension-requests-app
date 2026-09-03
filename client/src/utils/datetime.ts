/**
 * Convert an absolute ISO timestamp to the browser's local datetime-local value.
 */
export const toDateTimeLocalString = (isoString: string): string => {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

/**
 * datetime-local values are browser-local wall-clock times with no offset.
 * Convert one to an absolute UTC timestamp before sending it to the API.
 */
export const localDateTimeToUtcIso = (localDateTime: string): string => {
  const date = new Date(localDateTime);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid local date and time');
  }
  return date.toISOString();
};
