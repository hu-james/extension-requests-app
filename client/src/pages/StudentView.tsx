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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-dismiss notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
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
      setSelectedAssignments(selectedAssignments.filter(id => id !== assignmentId));
      const newDates = { ...requestedDates };
      delete newDates[assignmentId];
      setRequestedDates(newDates);
    } else {
      // Add assignment
      setSelectedAssignments([...selectedAssignments, assignmentId]);
      // Set default date to assignment's due date at 11:59 PM
      const dueDate = new Date(assignment.dueDate);
      setRequestedDates({
        ...requestedDates,
        [assignmentId]: getDefaultDateTime(dueDate)
      });
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
      <h1 className="text-2xl font-bold mb-4">Request Assignment Extensions</h1>

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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Assignment Selector Dropdown */}
        <div className="border rounded-lg">
          <button
            type="button"
            onClick={() => setIsAssignmentSelectorOpen(!isAssignmentSelectorOpen)}
            className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <div className="flex items-center space-x-2">
              <span className="font-semibold">Select Assignments</span>
              {selectedAssignments.length > 0 && (
                <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                  {selectedAssignments.length} selected
                </span>
              )}
            </div>
            <svg
              className={`w-5 h-5 transition-transform ${isAssignmentSelectorOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isAssignmentSelectorOpen && (
            <div className="p-4 border-t">
              {/* Search bar */}
              <div className="mb-3">
                <input
                  type="text"
                  placeholder="Search assignments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Assignment list */}
              <div className="max-h-80 overflow-y-auto space-y-2">
                {filteredAssignments.length === 0 ? (
                  <div className="text-center text-gray-500 py-4">
                    {searchQuery ? 'No assignments match your search' : 'No assignments available'}
                  </div>
                ) : (
                  filteredAssignments.map((assignment: Assignment) => (
                    <div
                      key={assignment.id}
                      onClick={() => toggleAssignmentSelection(assignment.id, assignment)}
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

              <div className="mt-3 pt-3 border-t text-sm text-gray-600">
                {selectedAssignments.length} of {assignments.length} assignments selected
              </div>
            </div>
          )}
        </div>

        {/* Selected Assignments with Date Pickers */}
        {selectedAssignments.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Set Requested Due Dates</h2>
            <div className="space-y-3">
              {selectedAssignments.map((assignmentId) => {
                const assignment = getAssignmentById(assignmentId);
                if (!assignment) return null;

                return (
                  <div key={assignmentId} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0 mr-3">
                        <h3 className="font-medium text-gray-900">{assignment.title}</h3>
                        <div className="text-sm text-gray-600 mt-1">
                          Current due date: {format(new Date(assignment.dueDate), 'PPP p')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleAssignmentSelection(assignmentId, assignment)}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                        title="Remove assignment"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div>
                      <label htmlFor={`date-${assignmentId}`} className="block text-sm font-medium text-gray-700 mb-1">
                        Requested new due date:
                      </label>
                      <input
                        type="datetime-local"
                        id={`date-${assignmentId}`}
                        value={requestedDates[assignmentId] || ''}
                        onChange={(e) => setRequestedDates({
                          ...requestedDates,
                          [assignmentId]: e.target.value
                        })}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-lg font-semibold mb-2">Reason for Extension</h2>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            maxLength={10000}
            className={`w-full h-32 p-2 border rounded ${reason.length > 9500 ? 'border-yellow-500' : ''}`}
            placeholder="Please provide a detailed reason for your extension request..."
          />
          <div className={`text-sm mt-1 ${reason.length > 9500 ? 'text-yellow-600 font-medium' : 'text-gray-500'}`}>
            {reason.length} / 10,000 characters
          </div>
        </div>

        {/* Conditional Supporting Documentation Section */}
        {policy && policy.requireDocumentation && (
          <div>
            <h2 className="text-lg font-semibold mb-2">
              Supporting Documentation (Required)
            </h2>

            <div className="mb-3">
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf,.docx,.jpg,.jpeg,.png"
                className="p-2 border rounded w-full"
              />
              {files.length > 0 && (
                <div className="mt-2 text-sm text-gray-600">
                  {files.length} file(s) selected
                </div>
              )}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={createRequestMutation.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {createRequestMutation.isPending ? 'Submitting...' : 'Submit Request'}
        </button>
      </form>

      {existingRequests.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Your Existing Requests</h2>
          <div className="space-y-4">
            {existingRequests.map((request) => (
              <div key={request.id} className="p-4 border rounded">
                <div className="font-medium">{request.assignmentTitle}</div>
                <div className="text-sm text-gray-600">
                  Original due date: {format(new Date(request.originalDueDate), 'PPP p')}
                </div>
                <div className="text-sm text-gray-600">
                  Requested due date: {format(new Date(request.requestedDueDate), 'PPP p')}
                </div>
                {request.finalDueDate && (
                  <div className="text-sm font-medium text-green-700 mt-1">
                    ✓ Approved due date: {format(new Date(request.finalDueDate), 'PPP p')}
                  </div>
                )}
                <div className="mt-2">
                  Status: <span className={`font-medium ${
                    request.status === 'approved' ? 'text-green-600' :
                    request.status === 'denied' ? 'text-red-600' :
                    'text-yellow-600'
                  }`}>{request.status}</span>
                </div>
                {request.instructorNotes && (
                  <div className="mt-2 text-sm p-2 bg-gray-50 border border-gray-200 rounded">
                    <span className="font-medium">Instructor notes:</span> {request.instructorNotes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
