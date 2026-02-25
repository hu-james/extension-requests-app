import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { StudentView } from '../pages/StudentView'
import { assignmentApi, extensionApi, policyApi } from '../services/api'


vi.mock('../services/api', () => ({
  assignmentApi: {
    getAssignments: vi.fn(),
  },
  extensionApi: {
    getStudentRequests: vi.fn(),
    createRequest: vi.fn(),
  },
  policyApi: {
    getCoursePolicy: vi.fn(),
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

const mockAssignments = [
  { id: 1, title: 'Midterm Project', dueDate: '2026-03-15T23:59:00Z', courseId: 1, courseName: 'COP3530' },
  { id: 2, title: 'Final Essay',     dueDate: '2026-04-30T23:59:00Z', courseId: 1, courseName: 'COP3530' },
]

const mockPolicy = {
  enableMaxDaysExtension: false,
  maxDaysExtension: 7,
  requireDocumentation: false,
  notifyOnRequest: true,
}

const mockRequest = {
  id: 1,
  studentId: 1,
  studentName: 'Test Student',
  assignmentId: 1,
  assignmentTitle: 'Midterm Project',
  courseId: 1,
  courseName: 'COP3530',
  originalDueDate: '2026-03-15T23:59:00Z',
  requestedDueDate: '2026-03-20T23:59:00Z',
  reason: 'Medical emergency',
  status: 'pending' as const,
  createdAt: '2026-03-10T10:00:00Z',
  updatedAt: '2026-03-10T10:00:00Z',
}

describe('StudentView — Accessibility (axe)', () => {
  beforeEach(() => {
    vi.mocked(assignmentApi.getAssignments).mockResolvedValue(mockAssignments)
    vi.mocked(extensionApi.getStudentRequests).mockResolvedValue([])
    vi.mocked(policyApi.getCoursePolicy).mockResolvedValue(mockPolicy)
  })

  it('has no violations on initial render', async () => {
    const { container } = renderWithQuery(<StudentView courseId={1} />)
    await waitFor(() => expect(container.querySelector('h1')).toBeInTheDocument())

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('has no violations when documentation upload is required', async () => {
    vi.mocked(policyApi.getCoursePolicy).mockResolvedValue({
      ...mockPolicy,
      requireDocumentation: true,
    })
    const { container } = renderWithQuery(<StudentView courseId={1} />)
    await waitFor(() => expect(container.querySelector('h1')).toBeInTheDocument())

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('has no violations with a pending request in history', async () => {
    vi.mocked(extensionApi.getStudentRequests).mockResolvedValue([mockRequest])
    const { container } = renderWithQuery(<StudentView courseId={1} />)
    await waitFor(() => expect(container.querySelector('h1')).toBeInTheDocument())

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('has no violations with an approved request in history', async () => {
    vi.mocked(extensionApi.getStudentRequests).mockResolvedValue([
      { ...mockRequest, status: 'approved', finalDueDate: '2026-03-20T23:59:00Z' },
    ])
    const { container } = renderWithQuery(<StudentView courseId={1} />)
    await waitFor(() => expect(container.querySelector('h1')).toBeInTheDocument())

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('has no violations with a denied request in history', async () => {
    vi.mocked(extensionApi.getStudentRequests).mockResolvedValue([
      { ...mockRequest, status: 'denied', instructorNotes: 'Insufficient reason provided.' },
    ])
    const { container } = renderWithQuery(<StudentView courseId={1} />)
    await waitFor(() => expect(container.querySelector('h1')).toBeInTheDocument())

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })
})
