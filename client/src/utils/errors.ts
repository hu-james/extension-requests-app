import axios from 'axios';

interface ApiErrorResponse {
  error?: string;
}

/** Return a user-facing message without assuming the shape of an unknown error. */
export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    return error.response?.data?.error || fallback;
  }

  return fallback;
};
