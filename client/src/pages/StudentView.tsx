import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { assignmentApi, extensionApi, policyApi } from '../services/api';
import type { Assignment, ExtensionRequestForm } from '../types';
import { format } from 'date-fns';
import { localDateTimeToUtcIso } from '../utils/datetime';
import { getApiErrorMessage } from '../utils/errors';

// Helper function to get a date string with time set to 11:59 PM in local timezone
const getDefaultDateTime = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T23:59`;
};

type Notification = { type: 'success' | 'error'; message: string };

const scrollToTop = () => {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
};

export const StudentView: React.FC<{ courseId: number }> = ({ courseId }) => {
  const [selectedAssignments, setSelectedAssignments] = useState<number[]>([]);
  const [requestedDates, setRequestedDates] = useState<{ [key: number]: string }>({});
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isAssignmentSelectorOpen, setIsAssignmentSelectorOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState<Notification | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [formSubmitted, setFormSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const notificationReturnFocusRef = useRef<HTMLElement | null>(null);
  const notificationFocusRequestedRef = useRef(false);
  const focusTargetRef = useRef<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const selectorButtonRef = useRef<HTMLButtonElement>(null);

  const announceNotification = (nextNotification: Notification, focus = false) => {
    notificationReturnFocusRef.current = null;
    notificationFocusRequestedRef.current = focus;

    if (focus) {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && activeElement !== notificationRef.current) {
        notificationReturnFocusRef.current = activeElement;
      }
    }

    setNotification(nextNotification);
  };

  const dismissNotification = () => {
    const returnFocusTarget = notificationReturnFocusRef.current;
    const focusIsInsideNotification = Boolean(
      notificationRef.current?.contains(document.activeElement)
    );
    notificationReturnFocusRef.current = null;
    setNotification(null);

    if (!focusIsInsideNotification) return;

    window.setTimeout(() => {
      if (returnFocusTarget?.isConnected) {
        returnFocusTarget.focus();
      } else if (mainRef.current?.isConnected) {
        mainRef.current.focus();
      }
    }, 0);
  };

  const clearFormError = (field: string) => {
    setFormErrors((currentErrors) => {
      if (!currentErrors[field]) return currentErrors;

      const nextErrors = { ...currentErrors };
      delete nextErrors[field];
      return nextErrors;
    });
  };

  useEffect(() => {
    document.title = 'Request Extension — Auto-Extend';
  }, []);

  useEffect(() => {
    if (notification && notificationFocusRequestedRef.current) {
      notificationRef.current?.focus();
    }
  }, [notification]);

  useEffect(() => {
    if (focusTargetRef.current) {
      const targetId = focusTargetRef.current;
      focusTargetRef.current = null;
      document.getElementById(targetId)?.focus();
    }
  }, [formErrors, selectedAssignments]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      if (notification) {
        dismissNotification();
      } else if (isAssignmentSelectorOpen) {
        setIsAssignmentSelectorOpen(false);
        selectorButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAssignmentSelectorOpen, notification]);

  const {
    data: assignments = [],
    isError: assignmentsLoadFailed,
    isLoading: assignmentsLoading,
    isFetching: assignmentsFetching,
    refetch: refetchAssignments
  } = useQuery({
    queryKey: ['assignments', courseId],
    queryFn: () => assignmentApi.getAssignments(courseId),
    retry: false
  });

  const {
    data: existingRequests = [],
    isLoading: existingRequestsLoading,
    isError: existingRequestsLoadFailed,
    refetch: refetchExistingRequests
  } = useQuery({
    queryKey: ['studentRequests', courseId],
    queryFn: () => extensionApi.getStudentRequests(courseId),
    retry: false
  });

  const {
    data: policy,
    isLoading: policyLoading,
    isError: policyLoadFailed,
    refetch: refetchPolicy
  } = useQuery({
    queryKey: ['extensionPolicy', courseId],
    queryFn: () => policyApi.getCoursePolicy(courseId),
    retry: false
  });

  const createRequestMutation = useMutation({
    mutationFn: (request: ExtensionRequestForm) =>
      extensionApi.createRequest(courseId, request),
    onSuccess: () => {
      setSelectedAssignments([]);
      setRequestedDates({});
      setReason('');
      setFiles([]);
      setFormSubmitted(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      const successMessage = 'Extension request submitted successfully.';
      // This status region is mounted before submission. Updating it is more
      // reliable for screen readers than mounting a live region with text.
      setAnnouncementMessage(successMessage);
      announceNotification({
        type: 'success',
        message: successMessage
      });
      setFormErrors({});
      scrollToTop();
    },
    onError: (error: unknown) => {
      const errorMessage = getApiErrorMessage(error, 'Failed to submit extension request. Please try again.');
      announceNotification({
        type: 'error',
        message: errorMessage
      });
      scrollToTop();
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const nextErrors: Record<string, string> = {};
    setFormSubmitted(true);

    if (selectedAssignments.length === 0) {
      nextErrors.assignment = 'Select at least one assignment.';
    }
    if (selectedAssignments.length > 50) {
      nextErrors.assignment = 'You cannot request extensions for more than 50 assignments at once.';
    }

    selectedAssignments.forEach((assignmentId) => {
      if (!requestedDates[assignmentId]) {
        nextErrors[`date-${assignmentId}`] = 'Enter a requested new due date.';
      }
    });

    if (reason.trim() === '') {
      nextErrors.reason = 'Provide a reason for the extension request.';
    }

    if (reason.length > 10000) {
      nextErrors.reason = 'Reason must be 10,000 characters or fewer.';
    }

    if (policy?.requireDocumentation && files.length === 0) {
      nextErrors.documentation = 'Upload at least one supporting document.';
    }

    setFormErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      const firstDateError = selectedAssignments.find((assignmentId) => nextErrors[`date-${assignmentId}`]);
      const firstErrorId = nextErrors.assignment
        ? 'assignment-selector-button'
        : firstDateError
          ? `date-${firstDateError}`
          : nextErrors.reason
            ? 'extension-reason'
            : 'documentation-upload';
      focusTargetRef.current = firstErrorId;
      announceNotification({
        type: 'error',
        message: 'Please correct the highlighted fields before submitting.'
      }, false);
      return;
    }

    const request: ExtensionRequestForm = {
      assignmentIds: selectedAssignments,
      // datetime-local values have no timezone. Convert the browser-local wall
      // clock value to an absolute UTC instant before sending it to the API.
      // Otherwise the backend interprets the value as UTC and can reject a
      // valid extension in non-UTC timezones.
      requestedDueDates: Object.fromEntries(
        Object.entries(requestedDates).map(([assignmentId, localDateTime]) => [
          assignmentId,
          localDateTimeToUtcIso(localDateTime)
        ])
      ),
      reason,
      documentation: files
    };

    createRequestMutation.mutate(request);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const nextFiles = Array.from(e.target.files);
      setFiles(nextFiles);
      if (nextFiles.length > 0) clearFormError('documentation');
    }
  };

  const toggleAssignmentSelection = (
    assignmentId: number,
    assignment: Assignment,
    restoreFocusAfterRemoval = false
  ) => {
    if (selectedAssignments.includes(assignmentId)) {
      const newSelection = selectedAssignments.filter(id => id !== assignmentId);
      if (restoreFocusAfterRemoval || document.activeElement?.id === `remove-assignment-${assignmentId}`) {
        const removedIndex = selectedAssignments.indexOf(assignmentId);
        const nextFocusAssignmentId = newSelection[removedIndex] ?? newSelection[removedIndex - 1];
        focusTargetRef.current = nextFocusAssignmentId
          ? `remove-assignment-${nextFocusAssignmentId}`
          : 'assignment-selector-button';
      }
      setSelectedAssignments(newSelection);
      const newDates = { ...requestedDates };
      delete newDates[assignmentId];
      setRequestedDates(newDates);
      clearFormError(`date-${assignmentId}`);
      setAnnouncementMessage(`${assignment.title} removed. ${newSelection.length} of ${assignments.length} assignments selected.`);
    } else {
      const newSelection = [...selectedAssignments, assignmentId];
      setSelectedAssignments(newSelection);
      const dueDate = new Date(assignment.dueDate);
      setRequestedDates({
        ...requestedDates,
        [assignmentId]: getDefaultDateTime(dueDate)
      });
      clearFormError('assignment');
      setAnnouncementMessage(`${assignment.title} added. ${newSelection.length} of ${assignments.length} assignments selected.`);
    }
  };

  const filteredAssignments = assignments.filter((assignment: Assignment) =>
    assignment.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getAssignmentById = (id: number) => assignments.find((a: Assignment) => a.id === id);

  const handleAssignmentsRetry = async () => {
    const result = await refetchAssignments();
    if (!result.isError) {
      window.setTimeout(() => document.getElementById('assignment-selector-button')?.focus(), 0);
    }
  };

  const handlePolicyRetry = async () => {
    const result = await refetchPolicy();
    if (!result.isError) {
      window.setTimeout(() => document.getElementById('submit-request-button')?.focus(), 0);
    }
  };

  const handleExistingRequestsRetry = async () => {
    const result = await refetchExistingRequests();
    if (!result.isError) {
      window.setTimeout(() => document.getElementById('main-content')?.focus(), 0);
    }
  };

  return (
    <div className="p-4">
      {/* Skip link must be outside and before #main-content (2.4.1) */}
      <a
        href="#main-content"
        className="skip-to-main"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to main content
      </a>

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcementMessage}
      </div>

      <main id="main-content" ref={mainRef} tabIndex={-1} aria-labelledby="student-page-heading">
        <h1 id="student-page-heading" className="text-2xl font-bold mb-4">Request Assignment Extensions</h1>

      {/* Notification Toast */}
        {notification && (
        <div
          ref={notificationRef}
          role={notification.type === 'error' ? 'alert' : undefined}
          aria-live={notification.type === 'error' ? 'assertive' : undefined}
          aria-atomic={notification.type === 'error' ? 'true' : undefined}
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
            type="button"
            onClick={dismissNotification}
            aria-label="Close notification"
            className="text-gray-600 hover:text-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          </div>
        )}

        {assignmentsLoading && !assignmentsLoadFailed && (
          <p role="status" aria-live="polite" className="mb-4">
            Loading assignments from Canvas…
          </p>
        )}

        {assignmentsLoadFailed && (
          <div
            role="alert"
            className="mb-6 rounded-lg border-l-4 border-red-500 bg-red-50 p-4 text-red-800"
          >
            <p className="font-semibold">Assignments could not be loaded from Canvas.</p>
            <p className="mt-1 text-sm">
              Try again. If the problem continues, ask an administrator to verify the Canvas API connection.
            </p>
            <button
              type="button"
              onClick={handleAssignmentsRetry}
              disabled={assignmentsFetching}
              aria-busy={assignmentsFetching}
              aria-label="Try again to load assignments from Canvas"
              className="mt-3 rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {assignmentsFetching ? 'Trying again…' : 'Try again'}
            </button>
          </div>
        )}

        {policyLoading && (
          <p role="status" aria-live="polite" className="mb-4">
            Loading extension policy…
          </p>
        )}

        {policyLoadFailed && (
          <div
            role="alert"
            className="mb-6 rounded-lg border-l-4 border-red-500 bg-red-50 p-4 text-red-800"
          >
            <p className="font-semibold">Extension policy could not be loaded.</p>
            <p className="mt-1 text-sm">
              Try again before submitting your request so the course requirements can be checked.
            </p>
            <button
              type="button"
              onClick={handlePolicyRetry}
              disabled={policyLoading}
              aria-busy={policyLoading}
              aria-label="Try again to load extension policy"
              className="mt-3 rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {policyLoading ? 'Trying again…' : 'Try again'}
            </button>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-6"
          aria-busy={createRequestMutation.isPending || assignmentsFetching || policyLoading}
          noValidate
        >
          {/* Assignment Selector Dropdown */}
          <div className="border rounded-lg">
            <button
              ref={selectorButtonRef}
              id="assignment-selector-button"
              type="button"
              onClick={() => setIsAssignmentSelectorOpen(!isAssignmentSelectorOpen)}
              disabled={assignmentsLoading || assignmentsLoadFailed}
              aria-expanded={isAssignmentSelectorOpen}
              aria-controls="assignment-selector-panel"
              aria-describedby={formSubmitted && formErrors.assignment ? 'assignment-error' : undefined}
              aria-label={
                assignmentsLoading
                  ? 'Loading assignments from Canvas'
                  : assignmentsLoadFailed
                    ? 'Assignments unavailable because Canvas could not be reached'
                    : `Select Assignments. ${selectedAssignments.length} of ${assignments.length} currently selected`
              }
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center space-x-2">
                <span className="font-semibold">
                  {assignmentsLoading
                    ? 'Loading Assignments…'
                    : assignmentsLoadFailed
                      ? 'Assignments Unavailable'
                      : 'Select Assignments'}
                </span>
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

            {/* Panel always in DOM so aria-controls reference is always valid (4.1.2) */}
            <div id="assignment-selector-panel" className="p-4 border-t" hidden={!isAssignmentSelectorOpen}>
              <div className="mb-3">
                <label htmlFor="assignment-search" className="sr-only">
                  Search assignments by title
                </label>
                <input
                  id="assignment-search"
                  type="text"
                  placeholder="Search assignments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-500 rounded-lg text-sm placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <fieldset
                className="max-h-80 overflow-y-auto space-y-2"
                aria-invalid={formSubmitted && Boolean(formErrors.assignment)}
                aria-describedby={formSubmitted && formErrors.assignment ? 'assignment-error' : undefined}
              >
                <legend className="sr-only">Available assignments</legend>
                {filteredAssignments.length === 0 ? (
                  <p className="text-center text-gray-500 py-4" role="status">
                    {searchQuery ? 'No assignments match your search' : 'No assignments available'}
                  </p>
                ) : (
                  filteredAssignments.map((assignment: Assignment) => (
                    <label
                      key={assignment.id}
                      className={`flex items-start space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedAssignments.includes(assignment.id)
                          ? 'bg-blue-50 border-2 border-blue-500'
                          : 'bg-white border-2 border-gray-500 hover:border-gray-600'
                      }`}
                    >
                      <input
                        id={`assignment-${assignment.id}`}
                        type="checkbox"
                        name="assignment"
                        checked={selectedAssignments.includes(assignment.id)}
                        onChange={() => toggleAssignmentSelection(assignment.id, assignment)}
                        aria-invalid={formSubmitted && Boolean(formErrors.assignment)}
                        aria-describedby={formSubmitted && formErrors.assignment ? 'assignment-error' : undefined}
                        className="mt-1 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">{assignment.title}</div>
                        <div className="text-sm text-gray-600">
                          Due: {format(new Date(assignment.dueDate), 'PPP p')}
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </fieldset>

              <p className="mt-3 pt-3 border-t text-sm text-gray-600">
                {selectedAssignments.length} of {assignments.length} assignments selected
              </p>
            </div>
            {formSubmitted && formErrors.assignment && (
              <p id="assignment-error" className="px-4 pb-3 text-sm text-red-700">
                {formErrors.assignment}
              </p>
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
                          id={`remove-assignment-${assignmentId}`}
                          type="button"
                          onClick={() => toggleAssignmentSelection(assignmentId, assignment, true)}
                          aria-label={`Remove ${assignment.title} from selection`}
                          className="text-gray-600 hover:text-red-700 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <div>
                        <label htmlFor={`date-${assignmentId}`} className="block text-sm font-medium text-gray-700 mb-1">
                          Requested new due date for {assignment.title}: <span className="text-red-600" aria-label="required">*</span>
                        </label>
                        <input
                          type="datetime-local"
                          id={`date-${assignmentId}`}
                          value={requestedDates[assignmentId] || ''}
                          onChange={(e) => {
                            setRequestedDates({
                              ...requestedDates,
                              [assignmentId]: e.target.value
                            });
                            clearFormError(`date-${assignmentId}`);
                          }}
                          aria-required="true"
                          aria-invalid={formSubmitted && Boolean(formErrors[`date-${assignmentId}`])}
                          aria-describedby={`current-date-${assignmentId} date-help-${assignmentId}${formSubmitted && formErrors[`date-${assignmentId}`] ? ` date-error-${assignmentId}` : ''}`}
                          className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${formSubmitted && formErrors[`date-${assignmentId}`] ? 'border-red-600' : 'border-gray-500'}`}
                          required
                        />
                        <div id={`date-help-${assignmentId}`} className="text-xs text-gray-500 mt-1">
                          Select your preferred new due date and time
                        </div>
                        {formSubmitted && formErrors[`date-${assignmentId}`] && (
                          <p id={`date-error-${assignmentId}`} className="text-sm text-red-700 mt-1">
                            {formErrors[`date-${assignmentId}`]}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div>
            <label htmlFor="extension-reason" className="block text-lg font-semibold mb-2">
              Reason for Extension <span className="text-red-600" aria-label="required">*</span>
            </label>
            <textarea
              id="extension-reason"
              value={reason}
              onChange={(e) => {
                const nextReason = e.target.value;
                const wasApproachingLimit = reason.length > 9500;
                const isApproachingLimit = nextReason.length > 9500;
                setReason(nextReason);
                clearFormError('reason');
                if (isApproachingLimit && !wasApproachingLimit) {
                  setAnnouncementMessage('Approaching the 10,000 character limit for the reason.');
                } else if (!isApproachingLimit && wasApproachingLimit) {
                  setAnnouncementMessage('Character limit warning cleared.');
                }
              }}
              required
              maxLength={10000}
              aria-required="true"
              aria-invalid={formSubmitted && Boolean(formErrors.reason)}
              aria-describedby={`reason-char-count reason-help${formSubmitted && formErrors.reason ? ' reason-error' : ''}`}
              className={`w-full h-32 p-2 border rounded placeholder:text-gray-600 ${formSubmitted && formErrors.reason ? 'border-red-600' : reason.length > 9500 ? 'border-yellow-500 border-2' : 'border-gray-500'}`}
              placeholder="Please provide a detailed reason for your extension request..."
            />
            <div id="reason-help" className="text-xs text-gray-600 mt-1">
              Explain your circumstances and why you need additional time
            </div>
            <div
              id="reason-char-count"
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
              {reason.length} of 10,000 characters used.
            </div>
            {formSubmitted && formErrors.reason && (
              <p id="reason-error" className="text-sm text-red-700 mt-1">
                {formErrors.reason}
              </p>
            )}
          </div>

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
                  required={policy.requireDocumentation}
                  aria-invalid={formSubmitted && Boolean(formErrors.documentation)}
                  aria-describedby={`file-upload-help file-upload-status${formSubmitted && formErrors.documentation ? ' file-upload-error' : ''}`}
                  className={`p-2 border rounded w-full ${formSubmitted && formErrors.documentation ? 'border-red-600' : 'border-gray-500'}`}
                />
                <div id="file-upload-help" className="mt-2 text-xs text-gray-600">
                  Accepted formats: PDF, DOCX, JPG, JPEG, PNG. You can select multiple files.
                </div>
                {/* Always rendered so aria-describedby reference is always valid (4.1.2) */}
                <div id="file-upload-status" role="status" aria-live="polite" aria-atomic="true" className="mt-2 text-sm text-gray-700 font-medium">
                  {files.length > 0
                    ? `${files.length} file(s) selected: ${files.map(f => f.name).join(', ')}`
                    : 'No files selected.'}
                </div>
                {formSubmitted && formErrors.documentation && (
                  <p id="file-upload-error" className="text-sm text-red-700 mt-1">
                    {formErrors.documentation}
                  </p>
                )}
              </div>
            </fieldset>
          )}

          <button
            id="submit-request-button"
            type="submit"
              disabled={createRequestMutation.isPending || assignmentsLoading || assignmentsLoadFailed || policyLoading || policyLoadFailed}
            aria-busy={createRequestMutation.isPending || assignmentsFetching || policyLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createRequestMutation.isPending ? (
              'Submitting...'
            ) : (
              'Submit Request'
            )}
          </button>
        </form>

      {existingRequestsLoading && (
        <p role="status" aria-live="polite" className="mt-8">
          Loading your existing extension requests…
        </p>
      )}

      {existingRequestsLoadFailed && (
        <div role="alert" className="mt-8 rounded-lg border-l-4 border-red-500 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">Your existing requests could not be loaded.</p>
          <button
            type="button"
            onClick={handleExistingRequestsRetry}
            disabled={existingRequestsLoading}
            aria-busy={existingRequestsLoading}
            aria-label="Try again to load existing extension requests"
            className="mt-3 rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {existingRequestsLoading ? 'Trying again…' : 'Try again'}
          </button>
        </div>
      )}

      {!existingRequestsLoading && !existingRequestsLoadFailed && existingRequests.length > 0 && (
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
                    request.status === 'approved' ? 'text-green-700' :
                    request.status === 'denied' ? 'text-red-600' :
                    'text-yellow-800'
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
      </main>
    </div>
  );
};
