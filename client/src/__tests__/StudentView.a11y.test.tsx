import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    await screen.findByRole('button', { name: /select assignments\. 0 of 2 currently selected/i })

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('has no violations when documentation upload is required', async () => {
    vi.mocked(policyApi.getCoursePolicy).mockResolvedValue({
      ...mockPolicy,
      requireDocumentation: true,
    })
    const { container } = renderWithQuery(<StudentView courseId={1} />)
    await screen.findByLabelText(/upload supporting documents/i)

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('has no violations with a pending request in history', async () => {
    vi.mocked(extensionApi.getStudentRequests).mockResolvedValue([mockRequest])
    const { container } = renderWithQuery(<StudentView courseId={1} />)
    await screen.findByRole('article', { name: /extension request for midterm project/i })

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('has no violations with an approved request in history', async () => {
    vi.mocked(extensionApi.getStudentRequests).mockResolvedValue([
      { ...mockRequest, status: 'approved', finalDueDate: '2026-03-20T23:59:00Z' },
    ])
    const { container } = renderWithQuery(<StudentView courseId={1} />)
    await screen.findByRole('article', { name: /extension request for midterm project/i })

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('has no violations with a denied request in history', async () => {
    vi.mocked(extensionApi.getStudentRequests).mockResolvedValue([
      { ...mockRequest, status: 'denied', instructorNotes: 'Insufficient reason provided.' },
    ])
    const { container } = renderWithQuery(<StudentView courseId={1} />)
    await screen.findByRole('article', { name: /extension request for midterm project/i })

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('reports a Canvas assignment loading failure accessibly', async () => {
    vi.mocked(assignmentApi.getAssignments).mockRejectedValue(
      new Error('Canvas API token expired')
    )

    const { container } = renderWithQuery(<StudentView courseId={1} />)

    const errorHeading = await screen.findByText(
      /assignments could not be loaded from canvas/i
    )
    expect(errorHeading.closest('[role="alert"]')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: /assignments unavailable because canvas could not be reached/i,
      })
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled()

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('exposes native assignment controls and focuses the first invalid field', async () => {
    const { container } = renderWithQuery(<StudentView courseId={1} />)
    const selector = await screen.findByRole('button', {
      name: /select assignments\. 0 of 2 currently selected/i,
    })

    expect(selector).toHaveAttribute('id', 'assignment-selector-button')
    fireEvent.click(selector)

    const assignmentCheckbox = await screen.findByRole('checkbox', {
      name: /midterm project/i,
    })
    expect(assignmentCheckbox.closest('[role="checkbox"]')).toBeNull()
    expect(screen.getByText('0 of 2 assignments selected')).not.toHaveAttribute('aria-live')

    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(document.activeElement).toBe(selector))
    expect(selector).toHaveAttribute('aria-describedby', 'assignment-error')
    expect(container.querySelector('#assignment-error')).toHaveTextContent('Select at least one assignment.')
  })

  it('restores focus after removing the last selected assignment', async () => {
    renderWithQuery(<StudentView courseId={1} />)
    const selector = await screen.findByRole('button', {
      name: /select assignments\. 0 of 2 currently selected/i,
    })
    fireEvent.click(selector)

    const assignmentCheckbox = await screen.findByRole('checkbox', {
      name: /midterm project/i,
    })
    fireEvent.click(assignmentCheckbox)

    const removeButton = await screen.findByRole('button', {
      name: /remove midterm project from selection/i,
    })
    removeButton.focus()
    fireEvent.click(removeButton)

    await waitFor(() => expect(document.activeElement).toBe(selector))
  })

  it('keeps focus usable when an inline-error notification is dismissed', async () => {
    const { container } = renderWithQuery(<StudentView courseId={1} />)
    await screen.findByRole('button', {
      name: /select assignments\. 0 of 2 currently selected/i,
    })

    fireEvent.submit(container.querySelector('form')!)
    const closeButton = await screen.findByRole('button', { name: /close notification/i })
    closeButton.focus()
    fireEvent.click(closeButton)

    await waitFor(() => expect(document.activeElement).toBe(container.querySelector('main')))
  })

  it('does not move focus backward when a notification is dismissed elsewhere', async () => {
    const { container } = renderWithQuery(<StudentView courseId={1} />)
    const selector = await screen.findByRole('button', {
      name: /select assignments\. 0 of 2 currently selected/i,
    })

    fireEvent.submit(container.querySelector('form')!)
    const closeButton = await screen.findByRole('button', { name: /close notification/i })
    selector.focus()
    fireEvent.click(closeButton)

    expect(document.activeElement).toBe(selector)
  })

  it('moves focus after an assignment retry succeeds', async () => {
    vi.mocked(assignmentApi.getAssignments)
      .mockRejectedValueOnce(new Error('Canvas unavailable'))
      .mockResolvedValueOnce(mockAssignments)
    renderWithQuery(<StudentView courseId={1} />)

    const retryButton = await screen.findByRole('button', {
      name: /try again to load assignments from canvas/i,
    })
    fireEvent.click(retryButton)

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: /select assignments\. 0 of 2 currently selected/i })
      )
    )
  })
})
