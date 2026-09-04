import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extensionApi, policyApi } from '../services/api';
import type { ExtensionPolicy } from '../types';
import { format } from 'date-fns';
import { localDateTimeToUtcIso, toDateTimeLocalString } from '../utils/datetime';
import { getApiErrorMessage } from '../utils/errors';

// Helper function to add session token to file URLs
const addTokenToUrl = (url: string): string => {
  const token = sessionStorage.getItem('session_token');
  if (!token) return url;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
};

const SelectedFilterCheck: React.FC = () => (
  <span
    className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-gray-900 shadow-sm"
    aria-hidden="true"
  >
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
    </svg>
  </span>
);

type Notification = { type: 'success' | 'error'; message: string };

const scrollToTop = () => {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
};

const isValidDateTimeLocal = (value?: string): boolean => {
  return Boolean(value && !Number.isNaN(new Date(value).getTime()));
};

export const InstructorView: React.FC<{ courseId: number }> = ({ courseId }) => {
  const queryClient = useQueryClient();
  const [policyEdit, setPolicyEdit] = useState<ExtensionPolicy | null>(null);
  const [activeTab, setActiveTab] = useState<'requests' | 'settings'>('requests');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'denied'>('pending');
  const [sortBy, setSortBy] = useState<'date' | 'student' | 'status'>('date');
  const [notification, setNotification] = useState<Notification | null>(null);
  const [requestErrors, setRequestErrors] = useState<Record<string, string>>({});
  const [policyError, setPolicyError] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const notificationRef = React.useRef<HTMLDivElement>(null);
  const notificationReturnFocusRef = React.useRef<HTMLElement | null>(null);
  const notificationFocusRequestedRef = React.useRef(false);
  const focusTargetRef = React.useRef<string | null>(null);
  const pendingActionFocusRef = React.useRef<HTMLElement | null>(null);
  const mainRef = React.useRef<HTMLElement>(null);

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

  const clearRequestError = (field: string) => {
    setRequestErrors((currentErrors) => {
      if (!currentErrors[field]) return currentErrors;

      const nextErrors = { ...currentErrors };
      delete nextErrors[field];
      return nextErrors;
    });
  };

  useEffect(() => {
    document.title = 'Manage Extensions — Auto-Extend';
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
  }, [requestErrors, policyError, policyEdit]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && notification) {
        dismissNotification();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [notification]);

  const {
    data: requests = [],
    isLoading: requestsLoading,
    isError: requestsLoadFailed,
    refetch: refetchRequests
  } = useQuery({
    queryKey: ['instructorRequests', courseId],
    queryFn: () => extensionApi.getInstructorRequests(courseId)
  });

  const {
    data: policy,
    isLoading: policyLoading,
    isError: policyLoadFailed,
    refetch: refetchPolicy
  } = useQuery({
    queryKey: ['policy', courseId],
    queryFn: () => policyApi.getCoursePolicy(courseId)
  });

  const updateRequestMutation = useMutation({
    mutationFn: ({
      requestId,
      status,
      notes,
      newDueDate
    }: {
      requestId: number;
      status: 'approved' | 'denied';
      notes?: string;
      newDueDate?: string;
    }) => extensionApi.updateRequestStatus(courseId, requestId, status, notes, newDueDate),
    onSuccess: (updatedRequest, variables) => {
      const restoreFocus = pendingActionFocusRef.current === document.activeElement;
      pendingActionFocusRef.current = null;
      const updatedRequests = requests.map(request =>
        request.id === updatedRequest.id ? updatedRequest : request
      );
      queryClient.setQueryData(['instructorRequests', courseId], updatedRequests);
      const decision = variables.status === 'approved' ? 'approved' : 'denied';
      const successMessage = `Extension request ${decision} successfully.`;
      const currentRequestIndex = sortedRequests.findIndex(
        (request) => request.id === updatedRequest.id
      );
      const orderedOtherRequests = [
        ...sortedRequests.slice(currentRequestIndex + 1),
        ...sortedRequests.slice(0, currentRequestIndex),
      ];
      const nextPendingRequest = orderedOtherRequests.find(
        (request) => request.status === 'pending'
      );

      // This status region is mounted before the mutation begins. Updating it is
      // more reliable for screen readers than mounting a live region with text.
      setAnnouncementMessage(`${successMessage} ${updatedRequest.assignmentTitle}.`);
      announceNotification({
        type: 'success',
        message: successMessage
      });
      scrollToTop();

      // The active action control disappears after the decision. Move focus only
      // when that control still has focus; do not interrupt a user who moved on.
      if (restoreFocus) {
        window.setTimeout(() => {
          const nextAction = nextPendingRequest
            ? document.getElementById(`approve-request-${nextPendingRequest.id}`)
            : null;
          (nextAction ?? document.getElementById('requests-panel-heading'))?.focus();
        }, 0);
      }
    },
    onError: (error: unknown) => {
      const errorMessage = getApiErrorMessage(error, 'Failed to update extension request. Please try again.');
      announceNotification({
        type: 'error',
        message: errorMessage
      });
      scrollToTop();
    }
  });

  const updatePolicyMutation = useMutation({
    mutationFn: (newPolicy: ExtensionPolicy) => policyApi.updateCoursePolicy(courseId, newPolicy),
    onSuccess: (updatedPolicy) => {
      setPolicyEdit(null);
      setPolicyError('');
      queryClient.setQueryData(['policy', courseId], updatedPolicy);
      announceNotification({
        type: 'success',
        message: 'Extension policy updated successfully!'
      });
      scrollToTop();
    },
    onError: (error: unknown) => {
      const errorMessage = getApiErrorMessage(error, 'Failed to update policy. Please try again.');
      announceNotification({
        type: 'error',
        message: errorMessage
      });
      scrollToTop();
    }
  });

  const handleStatusUpdate = (
    requestId: number,
    status: 'approved' | 'denied',
    notes: string,
    newDueDate?: string
  ) => {
    const dateField = `newDate-${requestId}`;
    const notesField = `notes-${requestId}`;

    if (status === 'approved' && !isValidDateTimeLocal(newDueDate)) {
      const errorMessage = 'Enter a valid new due date before approving this request.';
      setRequestErrors((currentErrors) => ({ ...currentErrors, [dateField]: errorMessage }));
      focusTargetRef.current = dateField;
      announceNotification({
        type: 'error',
        message: 'Please correct the highlighted field before continuing.'
      }, false);
      return;
    }

    if (notes && notes.length > 5000) {
      const errorMessage = 'Instructor notes must be 5,000 characters or fewer.';
      setRequestErrors((currentErrors) => ({ ...currentErrors, [notesField]: errorMessage }));
      focusTargetRef.current = notesField;
      announceNotification({
        type: 'error',
        message: 'Please correct the highlighted field before continuing.'
      }, false);
      return;
    }

    clearRequestError(dateField);
    clearRequestError(notesField);
    const activeElement = document.activeElement;
    pendingActionFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    updateRequestMutation.mutate({
      requestId,
      status,
      notes,
      newDueDate: status === 'approved' && newDueDate
        ? localDateTimeToUtcIso(newDueDate)
        : undefined
    });
  };

  const handlePolicyUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (policyEdit) {
      if (
        policyEdit.enableMaxDaysExtension &&
        (!Number.isInteger(policyEdit.maxDaysExtension) || policyEdit.maxDaysExtension < 1 || policyEdit.maxDaysExtension > 365)
      ) {
        const errorMessage = 'Maximum days extension must be a whole number between 1 and 365 days.';
        setPolicyError(errorMessage);
        focusTargetRef.current = 'max-days-input';
        announceNotification({
          type: 'error',
          message: 'Please correct the highlighted field before continuing.'
        }, false);
        return;
      }
      setPolicyError('');
      updatePolicyMutation.mutate(policyEdit);
    }
  };

  const statusCounts = {
    all: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    denied: requests.filter(r => r.status === 'denied').length,
  };

  const filteredRequests = statusFilter === 'all'
    ? requests
    : requests.filter(r => r.status === statusFilter);

  const sortedRequests = [...filteredRequests].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'student':
        return a.studentName.localeCompare(b.studentName);
      case 'status': {
        const statusOrder = { pending: 0, approved: 1, denied: 2 };
        return statusOrder[a.status] - statusOrder[b.status];
      }
      default:
        return 0;
    }
  });

  const handlePolicyRetry = async () => {
    const result = await refetchPolicy();
    if (!result.isError) {
      window.setTimeout(() => document.getElementById('extension-policy-heading')?.focus(), 0);
    }
  };

  const handleRequestsRetry = async () => {
    const result = await refetchRequests();
    if (!result.isError) {
      window.setTimeout(() => document.getElementById('requests-panel-heading')?.focus(), 0);
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

      <main id="main-content" ref={mainRef} tabIndex={-1} aria-labelledby="instructor-page-heading">
        <h1 id="instructor-page-heading" className="text-2xl font-bold mb-6">Manage Extension Requests</h1>

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

        {/* Tab Navigation — onKeyDown implements WAI-ARIA arrow key pattern (2.1.1) */}
        <div className="mb-6 border-b border-gray-200">
          <nav
            className="-mb-px flex space-x-8"
            role="tablist"
            aria-label="Extension management sections"
            onKeyDown={(e) => {
              const tabs = ['requests', 'settings'] as const;
              const currentIndex = tabs.indexOf(activeTab);
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                const next = tabs[(currentIndex + 1) % tabs.length];
                setActiveTab(next);
                setAnnouncementMessage(`${next === 'requests' ? 'Extension Requests' : 'Policy Settings'} tab selected`);
                (document.getElementById(`${next}-tab`) as HTMLElement)?.focus();
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const prev = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
                setActiveTab(prev);
                setAnnouncementMessage(`${prev === 'requests' ? 'Extension Requests' : 'Policy Settings'} tab selected`);
                (document.getElementById(`${prev}-tab`) as HTMLElement)?.focus();
              } else if (e.key === 'Home' || e.key === 'End') {
                e.preventDefault();
                const destination = e.key === 'Home' ? tabs[0] : tabs[tabs.length - 1];
                setActiveTab(destination);
                setAnnouncementMessage(`${destination === 'requests' ? 'Extension Requests' : 'Policy Settings'} tab selected`);
                (document.getElementById(`${destination}-tab`) as HTMLElement)?.focus();
              }
            }}
          >
            <button
              type="button"
              onClick={() => {
                setActiveTab('requests');
                setAnnouncementMessage('Extension Requests tab selected');
              }}
              role="tab"
              aria-selected={activeTab === 'requests'}
              aria-controls="requests-panel"
              id="requests-tab"
              tabIndex={activeTab === 'requests' ? 0 : -1}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'requests'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              Extension Requests
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('settings');
                setAnnouncementMessage('Policy Settings tab selected');
              }}
              role="tab"
              aria-selected={activeTab === 'settings'}
              aria-controls="settings-panel"
              id="settings-tab"
              tabIndex={activeTab === 'settings' ? 0 : -1}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'settings'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              Policy Settings
            </button>
          </nav>
        </div>

        {/* Both panels always in DOM so aria-controls references are always valid (4.1.2) */}

        {/* Settings Tab Panel */}
        <div
          id="settings-panel"
          role="tabpanel"
          aria-labelledby="settings-tab"
          className="mb-8"
          hidden={activeTab !== 'settings'}
          aria-busy={policyLoading || updatePolicyMutation.isPending}
        >
          <h2 id="extension-policy-heading" tabIndex={-1} className="text-lg font-semibold mb-4">Extension Policy</h2>
          {policyLoading && (
            <p role="status" aria-live="polite">Loading extension policy…</p>
          )}
          {policyLoadFailed && (
            <div role="alert" className="mb-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-4 text-red-800">
              <p className="font-semibold">Extension policy could not be loaded.</p>
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
          {policy && !policyEdit && !policyLoadFailed ? (
            <div className="p-4 border rounded">
              <div>Set maximum days extension: {policy.enableMaxDaysExtension ? 'Yes' : 'No'}</div>
              {policy.enableMaxDaysExtension && (
                <div className="ml-4">Maximum days: {policy.maxDaysExtension}</div>
              )}
              <div>Require documentation via Canvas (in LTI app): {policy.requireDocumentation ? 'Yes' : 'No'}</div>
              <div>Notify on request: {policy.notifyOnRequest ? 'Yes' : 'No'}</div>

              <button
                id="edit-policy-button"
                type="button"
                onClick={() => {
                  focusTargetRef.current = 'enable-max-days';
                  setPolicyEdit(policy);
                  setPolicyError('');
                }}
                className="mt-2 px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
              >
                Edit Policy
              </button>
            </div>
          ) : policyEdit ? (
            <form
              onSubmit={handlePolicyUpdate}
              onKeyDown={(event) => {
                const target = event.target;
                if (
                  event.key === 'Enter' &&
                  target instanceof HTMLInputElement &&
                  target.type === 'checkbox'
                ) {
                  event.preventDefault();
                }
              }}
              className="p-4 border rounded"
              aria-label="Edit extension policy"
              aria-busy={updatePolicyMutation.isPending}
              noValidate
            >
              <fieldset className="space-y-4">
                <legend className="sr-only">Extension policy settings</legend>

                <div>
                  <label className="flex items-center cursor-pointer">
                    <input
                      id="enable-max-days"
                      type="checkbox"
                      name="enableMaxDaysExtension"
                      checked={policyEdit?.enableMaxDaysExtension || false}
                      onChange={(e) => {
                        setPolicyEdit(prev => prev ? {
                          ...prev,
                          enableMaxDaysExtension: e.target.checked
                        } : null);
                        setPolicyError('');
                      }}
                      aria-describedby="max-days-help"
                      className="mr-2 w-4 h-4"
                    />
                    <span>Set maximum days extension</span>
                  </label>
                  <div id="max-days-help" className="ml-6 text-xs text-gray-600 mt-1">
                    Limit how many days students can request for extensions
                  </div>
                </div>

                {policyEdit?.enableMaxDaysExtension && (
                  <div className="ml-6">
                    <label htmlFor="max-days-input" className="block mb-1 text-sm font-medium">
                      Maximum days extension:
                    </label>
                    <input
                      id="max-days-input"
                      type="number"
                      name="maxDaysExtension"
                      min="1"
                      max="365"
                      value={Number.isFinite(policyEdit?.maxDaysExtension) ? policyEdit?.maxDaysExtension : ''}
                      onChange={(e) => {
                        setPolicyEdit(prev => prev ? {
                          ...prev,
                          maxDaysExtension: e.target.value === '' ? Number.NaN : Number.parseInt(e.target.value, 10)
                        } : null);
                        setPolicyError('');
                      }}
                      aria-invalid={Boolean(policyError)}
                      aria-describedby={`max-days-range${policyError ? ' max-days-error' : ''}`}
                      className={`p-2 border rounded w-24 ${policyError ? 'border-red-600' : 'border-gray-500'}`}
                    />
                    <div id="max-days-range" className="text-xs text-gray-600 mt-1">
                      Enter a value between 1 and 365 days
                    </div>
                    {policyError && (
                      <p id="max-days-error" className="text-sm text-red-700 mt-1">
                        {policyError}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="flex items-center cursor-pointer">
                    <input
                      id="require-documentation"
                      type="checkbox"
                      name="requireDocumentation"
                      checked={policyEdit?.requireDocumentation || false}
                      onChange={(e) => setPolicyEdit(prev => prev ? {
                        ...prev,
                        requireDocumentation: e.target.checked
                      } : null)}
                      aria-describedby="require-docs-help"
                      className="mr-2 w-4 h-4"
                    />
                    <span>Require documentation via Canvas (in LTI app)</span>
                  </label>
                  <div id="require-docs-help" className="ml-6 text-xs text-gray-600 mt-1">
                    Students must upload supporting documents with their request
                  </div>
                </div>

                <div>
                  <label className="flex items-center cursor-pointer">
                    <input
                      id="notify-on-request"
                      type="checkbox"
                      name="notifyOnRequest"
                      checked={policyEdit?.notifyOnRequest || false}
                      onChange={(e) => setPolicyEdit(prev => prev ? {
                        ...prev,
                        notifyOnRequest: e.target.checked
                      } : null)}
                      aria-describedby="notify-help"
                      className="mr-2 w-4 h-4"
                    />
                    <span>Notify on request</span>
                  </label>
                  <div id="notify-help" className="ml-6 text-xs text-gray-600 mt-1">
                    Receive notifications when students submit extension requests
                  </div>
                </div>

                <div className="space-x-2 pt-2">
                  <button
                    type="submit"
                    disabled={updatePolicyMutation.isPending}
                    aria-busy={updatePolicyMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Save Policy
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      focusTargetRef.current = 'edit-policy-button';
                      setPolicyEdit(null);
                      setPolicyError('');
                    }}
                    className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </fieldset>
            </form>
          ) : null}
        </div>

        {/* Requests Tab Panel */}
        <div
          id="requests-panel"
          role="tabpanel"
          aria-labelledby="requests-tab"
          hidden={activeTab !== 'requests'}
          aria-busy={requestsLoading || updateRequestMutation.isPending}
        >
          <h2 id="requests-panel-heading" tabIndex={-1} className="text-lg font-semibold mb-4">Extension Requests</h2>

          {requestsLoading && (
            <p role="status" aria-live="polite">Loading extension requests…</p>
          )}
          {requestsLoadFailed && (
            <div role="alert" className="mb-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-4 text-red-800">
              <p className="font-semibold">Extension requests could not be loaded.</p>
              <button
                type="button"
                onClick={handleRequestsRetry}
                disabled={requestsLoading}
                aria-busy={requestsLoading}
                aria-label="Try again to load extension requests"
                className="mt-3 rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {requestsLoading ? 'Trying again…' : 'Try again'}
              </button>
            </div>
          )}

          {!requestsLoading && !requestsLoadFailed && (
            <>
          {/* Status Summary Cards — grid-cols-2 on small screens for reflow (1.4.10) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6" role="group" aria-label="Filter requests by status">
            <button
              type="button"
              onClick={() => {
                setStatusFilter('pending');
                setAnnouncementMessage(`Showing ${statusCounts.pending} pending requests`);
              }}
              aria-pressed={statusFilter === 'pending'}
              aria-controls="requests-list"
              aria-label={`Show pending requests. ${statusCounts.pending} pending`}
              className={`relative p-4 rounded-lg border-2 transition-all ${
                statusFilter === 'pending'
                  ? 'border-yellow-700 bg-yellow-50'
                  : 'border-gray-500 hover:border-yellow-700'
              }`}
            >
              {statusFilter === 'pending' && <SelectedFilterCheck />}
              <div className="flex items-center justify-center mb-1">
                <svg className="w-6 h-6 mr-2 text-yellow-800" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <div className="text-2xl font-bold text-yellow-800">{statusCounts.pending}</div>
              </div>
              <div className="text-sm text-gray-600">Pending</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter('approved');
                setAnnouncementMessage(`Showing ${statusCounts.approved} approved requests`);
              }}
              aria-pressed={statusFilter === 'approved'}
              aria-controls="requests-list"
              aria-label={`Show approved requests. ${statusCounts.approved} approved`}
              className={`relative p-4 rounded-lg border-2 transition-all ${
                statusFilter === 'approved'
                  ? 'border-green-700 bg-green-50'
                  : 'border-gray-500 hover:border-green-700'
              }`}
            >
              {statusFilter === 'approved' && <SelectedFilterCheck />}
              <div className="flex items-center justify-center mb-1">
                <svg className="w-6 h-6 mr-2 text-green-700" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div className="text-2xl font-bold text-green-700">{statusCounts.approved}</div>
              </div>
              <div className="text-sm text-gray-600">Approved</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter('denied');
                setAnnouncementMessage(`Showing ${statusCounts.denied} denied requests`);
              }}
              aria-pressed={statusFilter === 'denied'}
              aria-controls="requests-list"
              aria-label={`Show denied requests. ${statusCounts.denied} denied`}
              className={`relative p-4 rounded-lg border-2 transition-all ${
                statusFilter === 'denied'
                  ? 'border-red-700 bg-red-50'
                  : 'border-gray-500 hover:border-red-700'
              }`}
            >
              {statusFilter === 'denied' && <SelectedFilterCheck />}
              <div className="flex items-center justify-center mb-1">
                <svg className="w-6 h-6 mr-2 text-red-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div className="text-2xl font-bold text-red-600">{statusCounts.denied}</div>
              </div>
              <div className="text-sm text-gray-600">Denied</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setAnnouncementMessage(`Showing all ${statusCounts.all} requests`);
              }}
              aria-pressed={statusFilter === 'all'}
              aria-controls="requests-list"
              aria-label={`Show all requests. ${statusCounts.all} total`}
              className={`relative p-4 rounded-lg border-2 transition-all ${
                statusFilter === 'all'
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-500 hover:border-blue-600'
              }`}
            >
              {statusFilter === 'all' && <SelectedFilterCheck />}
              <div className="flex items-center justify-center mb-1">
                <svg className="w-6 h-6 mr-2 text-blue-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                  <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                </svg>
                <div className="text-2xl font-bold text-blue-600">{statusCounts.all}</div>
              </div>
              <div className="text-sm text-gray-600">All Requests</div>
            </button>
          </div>

          {/* Sorting Controls */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <label htmlFor="sort-select" className="text-sm font-medium text-gray-700">
                Sort by:
              </label>
              <select
                id="sort-select"
                value={sortBy}
                onChange={(e) => {
                  const newSort = e.target.value as 'date' | 'student' | 'status';
                  setSortBy(newSort);
                  const sortLabels = { date: 'date, newest first', student: 'student name', status: 'status' };
                  setAnnouncementMessage(`Requests sorted by ${sortLabels[newSort]}`);
                }}
                className="px-3 py-2 border border-gray-500 rounded text-sm"
              >
                <option value="date">Date (Newest First)</option>
                <option value="student">Student Name</option>
                <option value="status">Status</option>
              </select>
            </div>
            <div className="text-sm text-gray-600">
              Showing {sortedRequests.length} of {requests.length} requests
            </div>
          </div>

          {/* Requests List */}
          <div id="requests-list" className="space-y-4">
            {sortedRequests.length === 0 ? (
              <div className="text-center py-12 text-gray-500" role="status">
                <div className="text-lg font-medium mb-2">No {statusFilter !== 'all' ? statusFilter : ''} requests found</div>
                <div className="text-sm">
                  {statusFilter !== 'all' && 'Try selecting a different filter above'}
                </div>
              </div>
            ) : (
              sortedRequests.map((request) => (
                <article
                  key={request.id}
                  aria-label={`Extension request from ${request.studentName} for ${request.assignmentTitle}`}
                  className={`p-4 border-2 rounded-lg transition-all ${
                    request.status === 'pending'
                      ? 'border-yellow-700 bg-yellow-50 shadow-md'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                        <h3 className="font-medium">{request.studentName}</h3>
                        <div className="text-sm text-gray-600">{request.assignmentTitle}</div>
                    </div>
                    <div className={`font-medium inline-flex items-center ${
                      request.status === 'approved' ? 'text-green-700' :
                      request.status === 'denied' ? 'text-red-600' :
                      'text-yellow-800'
                    }`}>
                      {request.status === 'approved' && (
                        <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                      {request.status === 'denied' && (
                        <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      )}
                      {request.status === 'pending' && (
                        <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                        </svg>
                      )}
                      <span className="capitalize">{request.status}</span>
                    </div>
                  </div>

                  <div className="mt-2 text-sm text-gray-600">
                    <div>Original due date: {request.originalDueDate ? format(new Date(request.originalDueDate), 'PPP p') : 'N/A'}</div>
                    <div>Requested due date: {request.requestedDueDate ? format(new Date(request.requestedDueDate), 'PPP p') : 'N/A'}</div>
                    {request.finalDueDate && (
                      <div className="font-medium text-green-700 mt-1 flex items-center">
                        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Approved due date: {format(new Date(request.finalDueDate), 'PPP p')}
                      </div>
                    )}
                  </div>

                  <div className="mt-2">
                    <h4 className="font-medium">Reason</h4>
                    <div className="text-sm">{request.reason}</div>
                  </div>

                  {request.documentation && request.documentation.length > 0 && (
                    <div className="mt-3">
                      <h4 className="font-medium mb-2">Supporting Documentation:</h4>
                      <div className="grid grid-cols-1 gap-2">
                          {request.documentation.map((doc, index) => (
                          <div key={index} className="border rounded p-3 bg-gray-50">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-700 font-medium">Document {index + 1}</span>
                              <div className="flex space-x-2">
                                <a
                                  href={addTokenToUrl(doc)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`View document ${index + 1} in new window`}
                                  className="inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                                >
                                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                  View
                                </a>
                                <button
                                  onClick={() => window.open(addTokenToUrl(doc), '_blank')}
                                  aria-label={`Download document ${index + 1}`}
                                  className="inline-flex items-center px-3 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                                >
                                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                  Download
                                </button>
                              </div>
                            </div>
                            {doc.toLowerCase().endsWith('.pdf') && (
                              <div className="mt-2 border rounded">
                                <iframe
                                  src={addTokenToUrl(doc)}
                                  className="w-full h-64"
                                  title={`PDF preview of document ${index + 1} for ${request.studentName}'s extension request`}
                                ></iframe>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {request.status !== 'pending' && request.instructorNotes && (
                    <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded">
                      <h4 className="font-medium text-sm text-gray-700 mb-1">Instructor Notes</h4>
                      <div className="text-sm text-gray-800">{request.instructorNotes}</div>
                      {request.approvedBy && (
                        <div className="text-xs text-gray-500 mt-2">
                          — {request.approvedBy} {request.approvedAt ? `on ${format(new Date(request.approvedAt), 'PPP p')}` : ''}
                        </div>
                      )}
                    </div>
                  )}

                  {request.status === 'pending' && (
                    <fieldset
                      className="mt-4 space-y-3 p-3 bg-white rounded border border-gray-300"
                      aria-labelledby={`decision-heading-${request.id}`}
                    >
                      <legend id={`decision-heading-${request.id}`} className="sr-only">
                        Review extension request from {request.studentName} for {request.assignmentTitle}
                      </legend>

                      <div>
                        <label htmlFor={`newDate-${request.id}`} className="block text-sm font-medium mb-1">
                          New due date for {request.assignmentTitle} (required when approving): <span className="text-red-600" aria-label="required">*</span>
                        </label>
                        <input
                          type="datetime-local"
                          className={`p-2 border rounded w-full ${requestErrors[`newDate-${request.id}`] ? 'border-red-600' : 'border-gray-500'}`}
                          id={`newDate-${request.id}`}
                          defaultValue={request.requestedDueDate ? toDateTimeLocalString(request.requestedDueDate) : ''}
                          aria-required="true"
                          aria-invalid={Boolean(requestErrors[`newDate-${request.id}`])}
                          aria-describedby={`newDate-help-${request.id}${requestErrors[`newDate-${request.id}`] ? ` newDate-error-${request.id}` : ''}`}
                          onChange={() => clearRequestError(`newDate-${request.id}`)}
                        />
                        <div id={`newDate-help-${request.id}`} className="text-xs text-gray-600 mt-1">
                          Pre-populated with student's requested date. You can modify if needed.
                        </div>
                        {requestErrors[`newDate-${request.id}`] && (
                          <p id={`newDate-error-${request.id}`} className="text-sm text-red-700 mt-1">
                            {requestErrors[`newDate-${request.id}`]}
                          </p>
                        )}
                      </div>

                      <div>
                        <label htmlFor={`notes-${request.id}`} className="block text-sm font-medium mb-1">
                          Notes (optional):
                        </label>
                        <textarea
                          className={`w-full p-2 border rounded text-sm placeholder:text-gray-600 ${requestErrors[`notes-${request.id}`] ? 'border-red-600' : 'border-gray-500'}`}
                          rows={2}
                          maxLength={5000}
                          id={`notes-${request.id}`}
                          aria-invalid={Boolean(requestErrors[`notes-${request.id}`])}
                          aria-describedby={`notes-help-${request.id}${requestErrors[`notes-${request.id}`] ? ` notes-error-${request.id}` : ''}`}
                          placeholder="Add notes for the student (max 5,000 characters)"
                          onChange={() => clearRequestError(`notes-${request.id}`)}
                        />
                        <div id={`notes-help-${request.id}`} className="text-xs text-gray-600 mt-1">
                          Optional feedback or explanation for the student
                        </div>
                        {requestErrors[`notes-${request.id}`] && (
                          <p id={`notes-error-${request.id}`} className="text-sm text-red-700 mt-1">
                            {requestErrors[`notes-${request.id}`]}
                          </p>
                        )}
                      </div>

                      <div className="flex space-x-2 pt-2">
                        <button
                          id={`approve-request-${request.id}`}
                          type="button"
                          disabled={updateRequestMutation.isPending}
                          aria-busy={updateRequestMutation.isPending}
                          onClick={() => handleStatusUpdate(
                            request.id,
                            'approved',
                            (document.getElementById(`notes-${request.id}`) as HTMLTextAreaElement).value,
                            (document.getElementById(`newDate-${request.id}`) as HTMLInputElement).value
                          )}
                          aria-label={`Approve extension request for ${request.studentName}, ${request.assignmentTitle}`}
                          className="inline-flex items-center px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={updateRequestMutation.isPending}
                          aria-busy={updateRequestMutation.isPending}
                          onClick={() => handleStatusUpdate(
                            request.id,
                            'denied',
                            (document.getElementById(`notes-${request.id}`) as HTMLTextAreaElement).value
                          )}
                          aria-label={`Deny extension request for ${request.studentName}, ${request.assignmentTitle}`}
                          className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                          Deny
                        </button>
                      </div>
                    </fieldset>
                  )}
                </article>
              ))
            )}
          </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default InstructorView;
