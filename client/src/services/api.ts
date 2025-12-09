import axios from 'axios';
import type { Assignment, ExtensionRequest, ExtensionRequestForm, ExtensionPolicy } from '../types';

// Get session token from URL parameters
const getSessionToken = (): string | null => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('session_token');

  // Store in sessionStorage for subsequent requests
  if (token) {
    sessionStorage.setItem('session_token', token);
    return token;
  }

  // Try to get from sessionStorage
  return sessionStorage.getItem('session_token');
};

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // Important for session cookies
});

// Add interceptor to include session token in all requests
api.interceptors.request.use((config) => {
  const token = getSessionToken();
  if (token) {
    config.headers['X-Session-Token'] = token;
  }
  return config;
});

export const assignmentApi = {
  getAssignments: async (courseId: number): Promise<Assignment[]> => {
    const response = await api.get(`/courses/${courseId}/assignments`);
    return response.data;
  },
};

export const extensionApi = {
  createRequest: async (courseId: number, request: ExtensionRequestForm): Promise<any> => {
    // Create FormData for file uploads
    const formData = new FormData();

    // Add request data as JSON string
    formData.append('data', JSON.stringify({
      assignmentIds: request.assignmentIds,
      requestedDueDates: request.requestedDueDates,
      reason: request.reason
    }));

    // Add documentation files
    if (request.documentation && request.documentation.length > 0) {
      request.documentation.forEach((file) => {
        formData.append('documentation', file);
      });
    }

    const response = await api.post(
      `/courses/${courseId}/extension-requests`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data;
  },

  getStudentRequests: async (courseId: number): Promise<ExtensionRequest[]> => {
    const response = await api.get(`/courses/${courseId}/extension-requests/student`);
    return response.data;
  },

  getInstructorRequests: async (courseId: number, status?: string): Promise<ExtensionRequest[]> => {
    const params = status ? { status } : {};
    const response = await api.get(`/courses/${courseId}/extension-requests/instructor`, { params });
    return response.data;
  },

  updateRequestStatus: async (
    courseId: number,
    requestId: number,
    status: 'approved' | 'denied',
    notes?: string,
    newDueDate?: string
  ): Promise<ExtensionRequest> => {
    const response = await api.patch(`/courses/${courseId}/extension-requests/${requestId}`, {
      status,
      notes,
      newDueDate
    });
    return response.data;
  },
};

export const policyApi = {
  getCoursePolicy: async (courseId: number): Promise<ExtensionPolicy> => {
    const response = await api.get(`/courses/${courseId}/extension-policy`);
    return response.data;
  },

  updateCoursePolicy: async (courseId: number, policy: ExtensionPolicy): Promise<ExtensionPolicy> => {
    const response = await api.put(`/courses/${courseId}/extension-policy`, policy);
    return response.data;
  },
};
