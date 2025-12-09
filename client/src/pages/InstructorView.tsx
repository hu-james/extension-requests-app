import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extensionApi, policyApi } from '../services/api';
import type { ExtensionPolicy } from '../types';
import { format } from 'date-fns';

// Helper function to convert ISO date string to datetime-local format
// datetime-local expects format: YYYY-MM-DDTHH:mm (in local timezone)
const toDateTimeLocalString = (isoString: string): string => {
  const date = new Date(isoString);
  // Get local date components
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// Helper function to add session token to file URLs
const addTokenToUrl = (url: string): string => {
  const token = sessionStorage.getItem('session_token');
  if (!token) return url;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
};

export const InstructorView: React.FC<{ courseId: number }> = ({ courseId }) => {
  const queryClient = useQueryClient();
  const [policyEdit, setPolicyEdit] = useState<ExtensionPolicy | null>(null);
  const [activeTab, setActiveTab] = useState<'requests' | 'settings'>('requests');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'denied'>('pending');
  const [sortBy, setSortBy] = useState<'date' | 'student' | 'status'>('date');
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Auto-dismiss notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const { data: requests = [] } = useQuery({
    queryKey: ['instructorRequests', courseId],
    queryFn: () => extensionApi.getInstructorRequests(courseId)
  });

  const { data: policy } = useQuery({
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
      // Update the requests list with the new status
      const updatedRequests = requests.map(request =>
        request.id === updatedRequest.id ? updatedRequest : request
      );
      // Force a refresh of the requests query
      queryClient.setQueryData(['instructorRequests', courseId], updatedRequests);
      // Show success notification
      setNotification({
        type: 'success',
        message: `Extension request ${variables.status === 'approved' ? 'approved' : 'denied'} successfully!`
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || 'Failed to update extension request. Please try again.';
      setNotification({
        type: 'error',
        message: errorMessage
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  const updatePolicyMutation = useMutation({
    mutationFn: (newPolicy: ExtensionPolicy) => policyApi.updateCoursePolicy(courseId, newPolicy),
    onSuccess: () => {
      setNotification({
        type: 'success',
        message: 'Extension policy updated successfully!'
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || 'Failed to update policy. Please try again.';
      setNotification({
        type: 'error',
        message: errorMessage
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  const handleStatusUpdate = (
    requestId: number,
    status: 'approved' | 'denied',
    notes: string,
    newDueDate?: string
  ) => {
    // Validate notes length
    if (notes && notes.length > 5000) {
      setNotification({ type: 'error', message: 'Instructor notes must be less than 5,000 characters' });
      return;
    }
    updateRequestMutation.mutate({ requestId, status, notes, newDueDate });
  };

  const handlePolicyUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (policyEdit) {
      // Validate max days extension
      if (policyEdit.maxDaysExtension < 1 || policyEdit.maxDaysExtension > 365) {
        setNotification({ type: 'error', message: 'Maximum days extension must be between 1 and 365 days' });
        return;
      }
      updatePolicyMutation.mutate(policyEdit);
      setPolicyEdit(null);
    }
  };

  // Calculate status counts
  const statusCounts = {
    all: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    denied: requests.filter(r => r.status === 'denied').length,
  };

  // Filter requests by status
  const filteredRequests = statusFilter === 'all'
    ? requests
    : requests.filter(r => r.status === statusFilter);

  // Sort requests
  const sortedRequests = [...filteredRequests].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'student':
        return a.studentName.localeCompare(b.studentName);
      case 'status':
        const statusOrder = { pending: 0, approved: 1, denied: 2 };
        return statusOrder[a.status] - statusOrder[b.status];
      default:
        return 0;
    }
  });

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">Manage Extension Requests</h1>

      {/* Notification Toast */}
      {notification && (
        <div className={`mb-4 p-4 rounded-lg border-l-4 flex items-start justify-between ${
          notification.type === 'success'
            ? 'bg-green-50 border-green-500 text-green-800'
            : 'bg-red-50 border-red-500 text-red-800'
        }`}>
          <div className="flex items-start">
            {notification.type === 'success' ? (
              <svg className="w-5 h-5 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
            <span className="font-medium">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('requests')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'requests'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Extension Requests
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'settings'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Policy Settings
          </button>
        </nav>
      </div>

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Extension Policy</h2>
        {policy && !policyEdit ? (
          <div className="p-4 border rounded">
            <div>Set maximum days extension: {policy.enableMaxDaysExtension ? 'Yes' : 'No'}</div>
            {policy.enableMaxDaysExtension && (
              <div className="ml-4">Maximum days: {policy.maxDaysExtension}</div>
            )}
            <div>Require documentation via Canvas (in LTI app): {policy.requireDocumentation ? 'Yes' : 'No'}</div>
            <div>Notify on request: {policy.notifyOnRequest ? 'Yes' : 'No'}</div>

            <button
              onClick={() => setPolicyEdit(policy)}
              className="mt-2 px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
            >
              Edit Policy
            </button>
          </div>
        ) : (
          <form onSubmit={handlePolicyUpdate} className="p-4 border rounded">
            <div className="space-y-4">
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={policyEdit?.enableMaxDaysExtension || false}
                    onChange={(e) => setPolicyEdit(prev => prev ? {
                      ...prev,
                      enableMaxDaysExtension: e.target.checked
                    } : null)}
                    className="mr-2"
                  />
                  Set maximum days extension
                </label>
              </div>

              {policyEdit?.enableMaxDaysExtension && (
                <div className="ml-6">
                  <label className="block mb-1">Maximum days extension:</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={policyEdit?.maxDaysExtension || 7}
                    onChange={(e) => setPolicyEdit(prev => prev ? {
                      ...prev,
                      maxDaysExtension: parseInt(e.target.value)
                    } : null)}
                    className="p-1 border rounded"
                  />
                </div>
              )}

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={policyEdit?.requireDocumentation || false}
                    onChange={(e) => setPolicyEdit(prev => prev ? {
                      ...prev,
                      requireDocumentation: e.target.checked
                    } : null)}
                    className="mr-2"
                  />
                  Require documentation via Canvas (in LTI app)
                </label>
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={policyEdit?.notifyOnRequest || false}
                    onChange={(e) => setPolicyEdit(prev => prev ? {
                      ...prev,
                      notifyOnRequest: e.target.checked
                    } : null)}
                    className="mr-2"
                  />
                  Notify on request
                </label>
              </div>

              <div className="space-x-2">
                <button
                  type="submit"
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Save Policy
                </button>
                <button
                  type="button"
                  onClick={() => setPolicyEdit(null)}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}
        </div>
      )}

      {/* Requests Tab */}
      {activeTab === 'requests' && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Extension Requests</h2>

          {/* Status Summary Cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <button
              onClick={() => setStatusFilter('pending')}
              className={`p-4 rounded-lg border-2 transition-all ${
                statusFilter === 'pending'
                  ? 'border-yellow-500 bg-yellow-50'
                  : 'border-gray-200 hover:border-yellow-300'
              }`}
            >
              <div className="text-2xl font-bold text-yellow-600">{statusCounts.pending}</div>
              <div className="text-sm text-gray-600">Pending</div>
            </button>

            <button
              onClick={() => setStatusFilter('approved')}
              className={`p-4 rounded-lg border-2 transition-all ${
                statusFilter === 'approved'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-green-300'
              }`}
            >
              <div className="text-2xl font-bold text-green-600">{statusCounts.approved}</div>
              <div className="text-sm text-gray-600">Approved</div>
            </button>

            <button
              onClick={() => setStatusFilter('denied')}
              className={`p-4 rounded-lg border-2 transition-all ${
                statusFilter === 'denied'
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-200 hover:border-red-300'
              }`}
            >
              <div className="text-2xl font-bold text-red-600">{statusCounts.denied}</div>
              <div className="text-sm text-gray-600">Denied</div>
            </button>

            <button
              onClick={() => setStatusFilter('all')}
              className={`p-4 rounded-lg border-2 transition-all ${
                statusFilter === 'all'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <div className="text-2xl font-bold text-blue-600">{statusCounts.all}</div>
              <div className="text-sm text-gray-600">All Requests</div>
            </button>
          </div>

          {/* Sorting Controls */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date' | 'student' | 'status')}
                className="px-3 py-1 border border-gray-300 rounded text-sm"
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
          <div className="space-y-4">
          {sortedRequests.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <div className="text-lg font-medium mb-2">No {statusFilter !== 'all' ? statusFilter : ''} requests found</div>
              <div className="text-sm">
                {statusFilter !== 'all' && 'Try selecting a different filter above'}
              </div>
            </div>
          ) : (
            sortedRequests.map((request) => (
            <div
              key={request.id}
              className={`p-4 border-2 rounded-lg transition-all ${
                request.status === 'pending'
                  ? 'border-yellow-400 bg-yellow-50 shadow-md'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex justify-between">
                <div>
                  <div className="font-medium">{request.studentName}</div>
                  <div className="text-sm text-gray-600">{request.assignmentTitle}</div>
                </div>
                <div className={`font-medium ${
                  request.status === 'approved' ? 'text-green-600' :
                  request.status === 'denied' ? 'text-red-600' :
                  'text-yellow-600'
                }`}>
                  {request.status}
                </div>
              </div>

              <div className="mt-2 text-sm text-gray-600">
                <div>Original due date: {request.originalDueDate ? format(new Date(request.originalDueDate), 'PPP p') : 'N/A'}</div>
                <div>Requested due date: {request.requestedDueDate ? format(new Date(request.requestedDueDate), 'PPP p') : 'N/A'}</div>
                {request.finalDueDate && (
                  <div className="font-medium text-green-700 mt-1">
                    ✓ Approved due date: {format(new Date(request.finalDueDate), 'PPP p')}
                  </div>
                )}
              </div>

              <div className="mt-2">
                <div className="font-medium">Reason:</div>
                <div className="text-sm">{request.reason}</div>
              </div>

              {request.documentation && request.documentation.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium mb-2">Documentation:</div>
                  <div className="grid grid-cols-1 gap-2">
                    {request.documentation.map((doc, index) => (
                      <div key={index} className="border rounded p-2 bg-gray-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">Document {index + 1}</span>
                          <div className="space-x-2">
                            <a
                              href={addTokenToUrl(doc)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                            >
                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              View
                            </a>
                            <button
                              onClick={() => window.open(addTokenToUrl(doc), '_blank')}
                              className="inline-flex items-center px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                            >
                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                              title={`Document Preview ${index + 1}`}
                            ></iframe>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Show instructor notes for approved/denied requests */}
              {request.status !== 'pending' && request.instructorNotes && (
                <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded">
                  <div className="font-medium text-sm text-gray-700 mb-1">Instructor Notes:</div>
                  <div className="text-sm text-gray-800">{request.instructorNotes}</div>
                  {request.approvedBy && (
                    <div className="text-xs text-gray-500 mt-2">
                      — {request.approvedBy} {request.approvedAt ? `on ${format(new Date(request.approvedAt), 'PPP p')}` : ''}
                    </div>
                  )}
                </div>
              )}

              {request.status === 'pending' && (
                <div className="mt-4 space-y-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      New due date:
                    </label>
                    <input
                      type="datetime-local"
                      className="p-1 border rounded"
                      id={`newDate-${request.id}`}
                      defaultValue={request.requestedDueDate ? toDateTimeLocalString(request.requestedDueDate) : ''}
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      Pre-populated with student's requested date. You can modify if needed.
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Notes (optional):
                    </label>
                    <textarea
                      className="w-full p-2 border rounded text-sm"
                      rows={2}
                      maxLength={5000}
                      id={`notes-${request.id}`}
                      placeholder="Add notes for the student (max 5,000 characters)"
                    />
                  </div>

                  <div className="space-x-2">
                    <button
                      onClick={() => handleStatusUpdate(
                        request.id,
                        'approved',
                        (document.getElementById(`notes-${request.id}`) as HTMLTextAreaElement).value,
                        (document.getElementById(`newDate-${request.id}`) as HTMLInputElement).value
                      )}
                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(
                        request.id,
                        'denied',
                        (document.getElementById(`notes-${request.id}`) as HTMLTextAreaElement).value
                      )}
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
          )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InstructorView;
