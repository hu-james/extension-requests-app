import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { assignmentApi, extensionApi, policyApi } from '../services/api';
import type { Assignment, ExtensionRequestForm } from '../types';
import { format } from 'date-fns';

// Helper function to get a date string with time set to 11:59 PM in local timezone
const getDefaultDateTime = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T23:59`; // 11:59 PM
};

export const StudentView: React.FC<{ courseId: number }> = ({ courseId }) => {
  const [selectedAssignments, setSelectedAssignments] = useState<number[]>([]);
  const [requestedDates, setRequestedDates] = useState<{ [key: number]: string }>({});
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isAssignmentSelectorOpen, setIsAssignmentSelectorOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Auto-dismiss notification after 5 seconds and move focus
  useEffect(() => {
    if (notification) {
      // Move focus to notification for screen readers
      if (notificationRef.current) {
        notificationRef.current.focus();
      }
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Keyboard support for closing notification with Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && notification) {
        setNotification(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [notification]);

  const { data: assignments = [] } = useQuery({
    queryKey: ['assignments', courseId],
    queryFn: () => assignmentApi.getAssignments(courseId),
    retry: false
  });

  const { data: existingRequests = [] } = useQuery({
    queryKey: ['studentRequests', courseId],
    queryFn: () => extensionApi.getStudentRequests(courseId),
    retry: false
  });

  const { data: policy } = useQuery({
    queryKey: ['extensionPolicy', courseId],
    queryFn: () => policyApi.getCoursePolicy(courseId),
    retry: false
  });


  const createRequestMutation = useMutation({
    mutationFn: (request: ExtensionRequestForm) =>
      extensionApi.createRequest(courseId, request),
    onSuccess: () => {
      // Reset form
      setSelectedAssignments([]);
      setRequestedDates({});
      setReason('');
      setFiles([]);
      // Clear the file input element
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      // Show success notification
      setNotification({
        type: 'success',
        message: 'Extension request submitted successfully!'
      });
      // Scroll to top to see notification
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || 'Failed to submit extension request. Please try again.';
      setNotification({
        type: 'error',
        message: errorMessage
      });
      // Scroll to top to see notification
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedAssignments.length === 0) {
      setNotification({ type: 'error', message: 'Please select at least one assignment' });
      return;
    }
    if (selectedAssignments.length > 50) {
      setNotification({ type: 'error', message: 'Cannot request extensions for more than 50 assignments at once' });
      return;
    }
    if (reason.trim() === '') {
      setNotification({ type: 'error', message: 'Please provide a reason for the extension request' });
      return;
    }
    if (reason.length > 10000) {
      setNotification({ type: 'error', message: 'Reason must be less than 10,000 characters' });
      return;
    }

    const request: ExtensionRequestForm = {
      assignmentIds: selectedAssignments,
      requestedDueDates: requestedDates,
      reason,
      documentation: files
    };

    createRequestMutation.mutate(request);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const toggleAssignmentSelection = (assignmentId: number, assignment: Assignment) => {
    if (selectedAssignments.includes(assignmentId)) {
      // Remove assignment
      const newSelection = selectedAssignments.filter(id => id !== assignmentId);
      setSelectedAssignments(newSelection);
      const newDates = { ...requestedDates };
      delete newDates[assignmentId];
      setRequestedDates(newDates);
      // Announce change to screen readers
      setAnnouncementMessage(`${assignment.title} removed. ${newSelection.length} of ${assignments.length} assignments selected.`);
    } else {
      // Add assignment
      const newSelection = [...selectedAssignments, assignmentId];
      setSelectedAssignments(newSelection);
      // Set default date to assignment's due date at 11:59 PM
      const dueDate = new Date(assignment.dueDate);
      setRequestedDates({
        ...requestedDates,
        [assignmentId]: getDefaultDateTime(dueDate)
      });
      // Announce change to screen readers
      setAnnouncementMessage(`${assignment.title} added. ${newSelection.length} of ${assignments.length} assignments selected.`);
    }
  };

  // Filter assignments based on search query
  const filteredAssignments = assignments.filter((assignment: Assignment) =>
    assignment.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get assignment details by ID
  const getAssignmentById = (id: number) => assignments.find((a: Assignment) => a.id === id);

  return (
    <div className="p-4">
      {/* Skip to main content link */}
      <a href="#main-content" className="skip-to-main">
        Skip to main content
      </a>

      {/* Screen reader announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcementMessage}
      </div>

      <h1 className="text-2xl font-bold mb-4">Request Assignment Extensions</h1>

      {/* Notification Toast */}
      {notification && (
        <div
          ref={notificationRef}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          tabIndex={-1}
          className={`mb-4 p-4 rounded-lg border-l-4 flex items-start justify-between ${
            notification.type === 'success'
              ? 'bg-green-50 border-green-500 text-green-800'
              : 'bg-red-50 border-red-500 text-red-800'
          }`}
        >
          <div className="flex items-start">
            {notification.type === 'success' ? (
              <svg className="w-5 h-5 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
            <span className="font-medium">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            aria-label="Close notification"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <main id="main-content">
        <form
          onSubmit={handleSubmit}
          className="space-y-6"
          aria-busy={createRequestMutation.isPending}
        >
          {/* Assignment Selector Dropdown */}
          <div className="border rounded-lg">
            <button
              type="button"
              onClick={() => setIsAssignmentSelectorOpen(!isAssignmentSelectorOpen)}
              aria-expanded={isAssignmentSelectorOpen}
              aria-controls="assignment-selector-panel"
              aria-label={`Select Assignments. ${selectedAssignments.length} of ${assignments.length} currently selected`}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <div className="flex items-center space-x-2">
                <span className="font-semibold">Select Assignments</span>
                {selectedAssignments.length > 0 && (
                  <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full" aria-hidden="true">
                    {selectedAssignments.length} selected
                  </span>
                )}
              </div>
              <svg
                className={`w-5 h-5 transition-transform ${isAssignmentSelectorOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

          {isAssignmentSelectorOpen && (
            <div id="assignment-selector-panel" className="p-4 border-t">
              {/* Search bar */}
              <div className="mb-3">
                <label htmlFor="assignment-search" className="sr-only">
                  Search assignments
                </label>
                <input
                  id="assignment-search"
                  type="text"
                  placeholder="Search assignments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search assignments by title"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Assignment list */}
              <div className="max-h-80 overflow-y-auto space-y-2" role="group" aria-label="Available assignments">
                {filteredAssignments.length === 0 ? (
                  <div className="text-center text-gray-500 py-4" role="status">
                    {searchQuery ? 'No assignments match your search' : 'No assignments available'}
                  </div>
                ) : (
                  filteredAssignments.map((assignment: Assignment) => (
                    <div
                      key={assignment.id}
                      onClick={() => toggleAssignmentSelection(assignment.id, assignment)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleAssignmentSelection(assignment.id, assignment);
                        }
                      }}
                      tabIndex={0}
                      role="checkbox"
                      aria-checked={selectedAssignments.includes(assignment.id)}
                      aria-label={`${assignment.title}, due ${format(new Date(assignment.dueDate), 'PPP p')}`}
                      className={`flex items-start space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedAssignments.includes(assignment.id)
                          ? 'bg-blue-50 border-2 border-blue-500'
                          : 'bg-white border-2 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAssignments.includes(assignment.id)}
                        onChange={() => toggleAssignmentSelection(assignment.id, assignment)}
                        tabIndex={-1}
                        aria-hidden="true"
                        className="mt-1 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">{assignment.title}</div>
                        <div className="text-sm text-gray-600">
                          Due: {format(new Date(assignment.dueDate), 'PPP p')}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-3 pt-3 border-t text-sm text-gray-600" role="status" aria-live="polite" aria-atomic="true">
                {selectedAssignments.length} of {assignments.length} assignments selected
              </div>
            </div>
          )}
          </div>

          {/* Selected Assignments with Date Pickers */}
          {selectedAssignments.length > 0 && (
            <fieldset className="space-y-3">
              <legend className="text-lg font-semibold">Set Requested Due Dates</legend>
              <div className="space-y-3">
                {selectedAssignments.map((assignmentId) => {
                  const assignment = getAssignmentById(assignmentId);
                  if (!assignment) return null;

                  return (
                    <div key={assignmentId} className="border rounded-lg p-4 bg-gray-50">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0 mr-3">
                          <h3 className="font-medium text-gray-900">{assignment.title}</h3>
                          <div className="text-sm text-gray-600 mt-1" id={`current-date-${assignmentId}`}>
                            Current due date: {format(new Date(assignment.dueDate), 'PPP p')}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleAssignmentSelection(assignmentId, assignment)}
                          aria-label={`Remove ${assignment.title} from selection`}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <div>
                        <label htmlFor={`date-${assignmentId}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Requested new due date: <span className="text-red-600" aria-label="required">*</span>
                        </label>
                        <input
                          type="datetime-local"
                          id={`date-${assignmentId}`}
                          value={requestedDates[assignmentId] || ''}
                          onChange={(e) => setRequestedDates({
                            ...requestedDates,
                            [assignmentId]: e.target.value
                          })}
                          aria-required="true"
                          aria-describedby={`current-date-${assignmentId} date-help-${assignmentId}`}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                        <div id={`date-help-${assignmentId}`} className="text-xs text-gray-500 mt-1">
                          Select your preferred new due date and time
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          )}

          <fieldset>
            <legend className="text-lg font-semibold mb-2">
              Reason for Extension <span className="text-red-600" aria-label="required">*</span>
            </legend>
            <label htmlFor="extension-reason" className="sr-only">
              Provide a detailed explanation for why you need an extension
            </label>
            <textarea
              id="extension-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              maxLength={10000}
              aria-required="true"
              aria-describedby="reason-char-count reason-help"
              aria-invalid={reason.trim() === '' && reason.length > 0 ? 'true' : 'false'}
              className={`w-full h-32 p-2 border rounded ${reason.length > 9500 ? 'border-yellow-500 border-2' : ''}`}
              placeholder="Please provide a detailed reason for your extension request..."
            />
            <div id="reason-help" className="text-xs text-gray-600 mt-1">
              Explain your circumstances and why you need additional time
            </div>
            <div
              id="reason-char-count"
              role="status"
              aria-live="polite"
              className={`text-sm mt-1 ${reason.length > 9500 ? 'text-yellow-700 font-medium' : 'text-gray-500'}`}
            >
              {reason.length > 9500 && (
                <span className="inline-flex items-center mr-2">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Approaching character limit.
                </span>
              )}
              {reason.length} / 10,000 characters
            </div>
          </fieldset>

          {/* Conditional Supporting Documentation Section */}
          {policy && policy.requireDocumentation && (
            <fieldset>
              <legend className="text-lg font-semibold mb-2">
                Supporting Documentation <span className="text-red-600" aria-label="required">*</span>
              </legend>

              <div className="mb-3">
                <label htmlFor="documentation-upload" className="block text-sm font-medium text-gray-700 mb-2">
                  Upload supporting documents
                </label>
                <input
                  id="documentation-upload"
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf,.docx,.jpg,.jpeg,.png"
                  aria-required="true"
                  aria-describedby="file-upload-help file-upload-status"
                  className="p-2 border rounded w-full"
                />
                <div id="file-upload-help" className="mt-2 text-xs text-gray-600">
                  Accepted formats: PDF, DOCX, JPG, JPEG, PNG. You can select multiple files.
                </div>
                {files.length > 0 && (
                  <div id="file-upload-status" role="status" className="mt-2 text-sm text-gray-700 font-medium">
                    {files.length} file(s) selected: {files.map(f => f.name).join(', ')}
                  </div>
                )}
              </div>
            </fieldset>
          )}

          <button
            type="submit"
            disabled={createRequestMutation.isPending}
            aria-busy={createRequestMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createRequestMutation.isPending ? (
              <>
                <span className="inline-block mr-2" aria-hidden="true">⏳</span>
                Submitting...
              </>
            ) : (
              'Submit Request'
            )}
          </button>
        </form>
      </main>

      {existingRequests.length > 0 && (
        <section className="mt-8" aria-labelledby="existing-requests-heading">
          <h2 id="existing-requests-heading" className="text-lg font-semibold mb-4">Your Existing Requests</h2>
          <div className="space-y-4">
            {existingRequests.map((request) => (
              <article key={request.id} className="p-4 border rounded" aria-label={`Extension request for ${request.assignmentTitle}`}>
                <h3 className="font-medium">{request.assignmentTitle}</h3>
                <div className="text-sm text-gray-600">
                  Original due date: {format(new Date(request.originalDueDate), 'PPP p')}
                </div>
                <div className="text-sm text-gray-600">
                  Requested due date: {format(new Date(request.requestedDueDate), 'PPP p')}
                </div>
                {request.finalDueDate && (
                  <div className="text-sm font-medium text-green-700 mt-1 flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Approved due date: {format(new Date(request.finalDueDate), 'PPP p')}
                  </div>
                )}
                <div className="mt-2 flex items-center">
                  <span className="text-sm text-gray-700 mr-2">Status:</span>
                  <span className={`font-medium inline-flex items-center ${
                    request.status === 'approved' ? 'text-green-600' :
                    request.status === 'denied' ? 'text-red-600' :
                    'text-yellow-600'
                  }`}>
                    {request.status === 'approved' && (
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                    {request.status === 'denied' && (
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    )}
                    {request.status === 'pending' && (
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                    )}
                    <span className="capitalize">{request.status}</span>
                  </span>
                </div>
                {request.instructorNotes && (
                  <div className="mt-2 text-sm p-2 bg-gray-50 border border-gray-200 rounded">
                    <span className="font-medium">Instructor notes:</span> {request.instructorNotes}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
