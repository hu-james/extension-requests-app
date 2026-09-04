import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    vi.clearAllMocks()
    vi.mocked(extensionApi.getInstructorRequests).mockResolvedValue([])
    vi.mocked(policyApi.getCoursePolicy).mockResolvedValue(mockPolicy)
  })

  it('has no violations with no requests', async () => {
    const { container } = renderWithQuery(<InstructorView courseId={1} />)
    await screen.findByText('No pending requests found')

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('has no violations with a pending request', async () => {
    vi.mocked(extensionApi.getInstructorRequests).mockResolvedValue([mockRequest])
    const { container } = renderWithQuery(<InstructorView courseId={1} />)
    await screen.findByRole('article', { name: /extension request from alice smith for midterm project/i })

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
    const allRequestsFilter = await screen.findByRole('button', { name: /show all requests/i })
    fireEvent.click(allRequestsFilter)
    await screen.findByRole('article', { name: /extension request from alice smith for midterm project/i })
    await screen.findByRole('article', { name: /extension request from bob jones for midterm project/i })

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('has no violations on the Policy Settings tab', async () => {
    const { container, getByRole } = renderWithQuery(<InstructorView courseId={1} />)

    // Switch to the settings tab
    fireEvent.click(getByRole('tab', { name: /policy settings/i }))
    await screen.findByRole('button', { name: /edit policy/i })
    await waitFor(() => expect(getByRole('tabpanel')).toBeInTheDocument())

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })

  it('prevents Enter on a policy checkbox from submitting the policy form', async () => {
    const { getByRole } = renderWithQuery(<InstructorView courseId={1} />)
    await waitFor(() => expect(getByRole('heading', { name: /manage extension requests/i })).toBeInTheDocument())

    fireEvent.click(getByRole('tab', { name: /policy settings/i }))
    fireEvent.click(await waitFor(() => getByRole('button', { name: /edit policy/i })))

    const checkbox = getByRole('checkbox', { name: /require documentation/i })
    expect(checkbox).not.toBeChecked()

    const enterEvent = createEvent.keyDown(checkbox, { key: 'Enter' })
    fireEvent(checkbox, enterEvent)

    expect(enterEvent.defaultPrevented).toBe(true)
    expect(checkbox).not.toBeChecked()
    expect(policyApi.updateCoursePolicy).not.toHaveBeenCalled()
  })

  it('associates approval errors with the date field and focuses it', async () => {
    vi.mocked(extensionApi.getInstructorRequests).mockResolvedValue([mockRequest])
    renderWithQuery(<InstructorView courseId={1} />)

    const request = await screen.findByRole('article', {
      name: /extension request from alice smith for midterm project/i,
    })
    const dateInput = within(request).getByLabelText(/new due date for midterm project/i)
    fireEvent.change(dateInput, { target: { value: '' } })

    const approveButton = within(request).getByRole('button', {
      name: /approve extension request for alice smith, midterm project/i,
    })
    fireEvent.click(approveButton)

    await waitFor(() => expect(document.activeElement).toBe(dateInput))
    expect(dateInput).toHaveAttribute('aria-invalid', 'true')
    expect(dateInput).toHaveAttribute(
      'aria-describedby',
      'newDate-help-1 newDate-error-1'
    )
    expect(within(request).getByText('Enter a valid new due date before approving this request.')).toBeInTheDocument()
    expect(extensionApi.updateRequestStatus).not.toHaveBeenCalled()
  })

  it('announces approval and restores focus after a disabled action causes focus to fall back to the document', async () => {
    vi.mocked(extensionApi.getInstructorRequests).mockResolvedValue([mockRequest])
    let resolveUpdate!: (value: Awaited<ReturnType<typeof extensionApi.updateRequestStatus>>) => void
    vi.mocked(extensionApi.updateRequestStatus).mockImplementation(() => new Promise((resolve) => {
      resolveUpdate = resolve
    })
    )
    const { container } = renderWithQuery(<InstructorView courseId={1} />)

    const approveButton = await screen.findByRole('button', {
      name: /approve extension request for alice smith, midterm project/i,
    })
    approveButton.focus()
    fireEvent.click(approveButton)
    await waitFor(() => expect(approveButton).toBeDisabled())
    document.body.tabIndex = -1
    document.body.focus()
    resolveUpdate({
      ...mockRequest,
      status: 'approved',
      finalDueDate: '2026-03-20T23:59:00Z',
    })

    const persistentStatus = container.querySelector('.sr-only[role="status"]')
    await waitFor(() =>
      expect(persistentStatus).toHaveTextContent(
        'Extension request approved successfully. Midterm Project.'
      )
    )
    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.getElementById('requests-panel-heading')
      )
    )
    document.body.removeAttribute('tabindex')
  })

  it('announces denial through the persistent status region and moves focus to the next pending action', async () => {
    const secondRequest = {
      ...mockRequest,
      id: 2,
      studentName: 'Bob Jones',
      assignmentTitle: 'Final Essay',
    }
    vi.mocked(extensionApi.getInstructorRequests).mockResolvedValue([mockRequest, secondRequest])
    vi.mocked(extensionApi.updateRequestStatus).mockResolvedValue({
      ...mockRequest,
      status: 'denied',
    })
    const { container } = renderWithQuery(<InstructorView courseId={1} />)

    const denyButton = await screen.findByRole('button', {
      name: /deny extension request for alice smith, midterm project/i,
    })
    denyButton.focus()
    fireEvent.click(denyButton)

    const persistentStatus = container.querySelector('.sr-only[role="status"]')
    await waitFor(() =>
      expect(persistentStatus).toHaveTextContent(
        'Extension request denied successfully. Midterm Project.'
      )
    )
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', {
          name: /approve extension request for bob jones, final essay/i,
        })
      )
    )
  })

  it('does not move focus after an instructor has moved elsewhere while a decision is pending', async () => {
    vi.mocked(extensionApi.getInstructorRequests).mockResolvedValue([mockRequest])
    let resolveUpdate!: (value: Awaited<ReturnType<typeof extensionApi.updateRequestStatus>>) => void
    vi.mocked(extensionApi.updateRequestStatus).mockImplementation(() => new Promise((resolve) => {
      resolveUpdate = resolve
    })
    )
    const { container } = renderWithQuery(<InstructorView courseId={1} />)

    const approveButton = await screen.findByRole('button', {
      name: /approve extension request for alice smith, midterm project/i,
    })
    const allRequestsFilter = screen.getByRole('button', { name: /show all requests/i })
    approveButton.focus()
    fireEvent.click(approveButton)
    await waitFor(() => expect(approveButton).toBeDisabled())
    allRequestsFilter.focus()
    resolveUpdate({
      ...mockRequest,
      status: 'approved',
      finalDueDate: '2026-03-20T23:59:00Z',
    })

    const persistentStatus = container.querySelector('.sr-only[role="status"]')
    await waitFor(() =>
      expect(persistentStatus).toHaveTextContent(
        'Extension request approved successfully. Midterm Project.'
      )
    )
    expect(document.activeElement).toBe(allRequestsFilter)
  })

  it('moves focus into policy editing and restores it after cancel', async () => {
    renderWithQuery(<InstructorView courseId={1} />)
    fireEvent.click(await screen.findByRole('tab', { name: /policy settings/i }))

    const editButton = await screen.findByRole('button', { name: /edit policy/i })
    fireEvent.click(editButton)
    const maxDaysToggle = await screen.findByRole('checkbox', {
      name: /set maximum days extension/i,
    })

    await waitFor(() => expect(document.activeElement).toBe(maxDaysToggle))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /edit policy/i }))
    )
  })

  it('keeps focus usable when a policy validation notice is dismissed', async () => {
    const { container } = renderWithQuery(<InstructorView courseId={1} />)
    fireEvent.click(await screen.findByRole('tab', { name: /policy settings/i }))
    fireEvent.click(await screen.findByRole('button', { name: /edit policy/i }))

    const maxDaysToggle = await screen.findByRole('checkbox', {
      name: /set maximum days extension/i,
    })
    fireEvent.click(maxDaysToggle)
    const maxDaysInput = await screen.findByRole('spinbutton', {
      name: /maximum days extension:/i,
    })
    fireEvent.change(maxDaysInput, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /save policy/i }))

    const closeButton = await screen.findByRole('button', { name: /close notification/i })
    closeButton.focus()
    fireEvent.click(closeButton)

    await waitFor(() => expect(document.activeElement).toBe(container.querySelector('main')))
  })

  it('has no violations with mixed pending, approved, and denied requests', async () => {
    vi.mocked(extensionApi.getInstructorRequests).mockResolvedValue([
      { ...mockRequest, id: 1, status: 'pending' },
      { ...mockRequest, id: 2, studentName: 'Carol White', status: 'approved', finalDueDate: '2026-03-22T23:59:00Z' },
      { ...mockRequest, id: 3, studentName: 'Dan Brown',  status: 'denied', instructorNotes: 'No documentation.' },
    ])
    const { container } = renderWithQuery(<InstructorView courseId={1} />)
    await screen.findByRole('article', { name: /extension request from alice smith for midterm project/i })

    const results = await axe.run(container)
    expect(results.violations).toHaveLength(0)
  })
})
