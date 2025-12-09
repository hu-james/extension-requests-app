export interface User {
  id: number;
  name: string;
  email: string;
  role: 'student' | 'instructor';
}

export interface Assignment {
  id: number;
  title: string;
  dueDate: string;
  courseId: number;
  courseName: string;
}

export interface ExtensionRequest {
  id: number;
  studentId: number;
  studentName: string;
  assignmentId: number;
  assignmentTitle: string;
  courseId: number;
  courseName: string;
  originalDueDate: string;
  requestedDueDate: string;
  finalDueDate?: string;
  reason: string;
  documentation?: string[];
  status: 'pending' | 'approved' | 'denied';
  instructorNotes?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExtensionRequestForm {
  assignmentIds: number[];
  requestedDueDates: { [key: number]: string };
  reason: string;
  documentation?: File[];
}

export interface ExtensionPolicy {
  enableMaxDaysExtension: boolean;
  maxDaysExtension: number;
  requireDocumentation: boolean;
  notifyOnRequest: boolean;
}
