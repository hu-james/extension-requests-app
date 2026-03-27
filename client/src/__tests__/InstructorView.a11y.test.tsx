import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { InstructorView } from '../pages/InstructorView'
import { extensionApi, policyApi } from '../services/api'

vi.mock('../services/api', () => ({
  extensionApi: {
    getInstructorRequests: vi.fn(),
    updateRequestStatus: vi.fn(),
  },
  policyApi: {
    getCoursePolicy: vi.fn(),
    updateCoursePolicy: vi.fn(),
  },
}))

const renderWithQuery = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

const mockPolicy = {
  enableMaxDaysExtension: false,
  maxDaysExtension: 7,
  requireDocumentation: false,
  notifyOnRequest: true,
}

const mockRequest = {
  id: 1,
  studentId: 1,
  studentName: 'Alice Smith',
  assignmentId: 1,
  assignmentTitle: 'Midterm Project',
  courseId: 1,
  courseName: 'COP3530',
  originalDueDate: '2026-03-15T23:59:00Z',
  requestedDueDate: '2026-03-20T23:59:00Z',
  reason: 'Medical emergency requiring hospitalization.',
  status: 'pending' as const,
  createdAt: '2026-03-10T10:00:00Z',
  updatedAt: '2026-03-10T10:00:00Z',
}

describe('InstructorView — Accessibility (axe)', () => {
  beforeEach(() => {
    vi.mocked(extensionApi.getInstructorRequests).mockResolvedValue([])
    vi.mocked(policyApi.getCoursePolicy).mockResolvedValue(mockPolicy)
  })

  it('has no violations with no requests', async () => {
    const { container } = renderWithQuery(<InstructorView courseId={1} />)
    await waitFor(() => expect(container.querySelector('h1')).toBeInTheDocument())

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('has no violations with a pending request', async () => {
    vi.mocked(extensionApi.getInstructorRequests).mockResolvedValue([mockRequest])
    const { container } = renderWithQuery(<InstructorView courseId={1} />)
    await waitFor(() => expect(container.querySelector('h1')).toBeInTheDocument())

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('has no violations with approved and denied requests', async () => {
    vi.mocked(extensionApi.getInstructorRequests).mockResolvedValue([
      {
        ...mockRequest,
        id: 1,
        status: 'approved',
        finalDueDate: '2026-03-20T23:59:00Z',
        instructorNotes: 'Approved — documentation verified.',
        approvedBy: 'Dr. Johnson',
        approvedAt: '2026-03-11T09:00:00Z',
      },
      {
        ...mockRequest,
        id: 2,
        studentName: 'Bob Jones',
        status: 'denied',
        instructorNotes: 'Insufficient documentation provided.',
      },
    ])
    const { container } = renderWithQuery(<InstructorView courseId={1} />)
    await waitFor(() => expect(container.querySelector('h1')).toBeInTheDocument())

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('has no violations on the Policy Settings tab', async () => {
    const { container, getByRole } = renderWithQuery(<InstructorView courseId={1} />)
    await waitFor(() => expect(container.querySelector('h1')).toBeInTheDocument())

    // Switch to the settings tab
    getByRole('tab', { name: /policy settings/i }).click()
    await waitFor(() => expect(getByRole('tabpanel')).toBeInTheDocument())

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('has no violations with mixed pending, approved, and denied requests', async () => {
    vi.mocked(extensionApi.getInstructorRequests).mockResolvedValue([
      { ...mockRequest, id: 1, status: 'pending' },
      { ...mockRequest, id: 2, studentName: 'Carol White', status: 'approved', finalDueDate: '2026-03-22T23:59:00Z' },
      { ...mockRequest, id: 3, studentName: 'Dan Brown',  status: 'denied', instructorNotes: 'No documentation.' },
    ])
    const { container } = renderWithQuery(<InstructorView courseId={1} />)
    await waitFor(() => expect(container.querySelector('h1')).toBeInTheDocument())

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })
})
