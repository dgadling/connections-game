import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuestionToolbar } from './QuestionToolbar.jsx'

const baseProps = {
  status: 'upcoming',
  setStatus: vi.fn(),
  loading: false,
  qsCount: 5,
  archived: false,
  newText: '',
  setNewText: vi.fn(),
  adding: false,
  addQuestion: vi.fn(),
  busy: false,
  seedQuestions: vi.fn(),
  showImport: false,
  setShowImport: vi.fn(),
  importText: '',
  setImportText: vi.fn(),
  doImport: vi.fn(),
  doExport: vi.fn(),
  shuffleQuestions: vi.fn(),
  qsLength: 5,
}

describe('QuestionToolbar', () => {
  it('renders status tabs and calls setStatus on click', async () => {
    const user = userEvent.setup()
    const setStatus = vi.fn()
    render(<QuestionToolbar {...baseProps} setStatus={setStatus} />)
    
    expect(screen.getByText('upcoming')).toBeInTheDocument()
    expect(screen.getByText('used')).toBeInTheDocument()
    expect(screen.getByText('graveyard')).toBeInTheDocument()
    
    await user.click(screen.getByText('used'))
    expect(setStatus).toHaveBeenCalledWith('used')
  })

  it('shows question count', () => {
    render(<QuestionToolbar {...baseProps} qsCount={42} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('add question input calls setNewText and addQuestion', async () => {
    const user = userEvent.setup()
    const setNewText = vi.fn()
    const addQuestion = vi.fn()
    render(<QuestionToolbar {...baseProps} setNewText={setNewText} addQuestion={addQuestion} newText="test question" />)
    
    const input = screen.getByPlaceholderText('Add a question…')
    expect(input).toBeInTheDocument()
    
    await user.type(input, 'x')
    expect(setNewText).toHaveBeenCalled()
    
    const addButton = screen.getByRole('button', { name: /add$/i })
    await user.click(addButton)
    expect(addQuestion).toHaveBeenCalled()
  })

  it('Enter key in input triggers addQuestion', async () => {
    const user = userEvent.setup()
    const addQuestion = vi.fn()
    render(<QuestionToolbar {...baseProps} addQuestion={addQuestion} newText="foo" />)
    
    const input = screen.getByPlaceholderText('Add a question…')
    await user.type(input, '{Enter}')
    expect(addQuestion).toHaveBeenCalled()
  })

  it('shows import/export/shuffle/seed buttons for upcoming status', () => {
    render(<QuestionToolbar {...baseProps} status="upcoming" archived={false} />)
    expect(screen.getByText(/load starter pack/i)).toBeInTheDocument()
    expect(screen.getByText(/import/i)).toBeInTheDocument()
    expect(screen.getByText(/export/i)).toBeInTheDocument()
    expect(screen.getByText(/shuffle/i)).toBeInTheDocument()
  })

  it('shuffle button is hidden when qsLength <= 1', () => {
    render(<QuestionToolbar {...baseProps} qsLength={1} />)
    expect(screen.queryByText(/shuffle/i)).not.toBeInTheDocument()
  })

  it('toggles import panel on Import button click', async () => {
    const user = userEvent.setup()
    const setShowImport = vi.fn()
    render(<QuestionToolbar {...baseProps} setShowImport={setShowImport} showImport={false} />)
    
    await user.click(screen.getByText(/import/i))
    expect(setShowImport).toHaveBeenCalled()
  })

  it('shows import textarea when showImport is true', () => {
    render(<QuestionToolbar {...baseProps} showImport={true} importText="test import" />)
    expect(screen.getByText(/paste questions, one per line/i)).toBeInTheDocument()
    const textarea = screen.getByPlaceholderText(/what scares you/i)
    expect(textarea).toHaveValue('test import')
    expect(screen.getByRole('button', { name: /^import$/i })).toBeInTheDocument()
  })

  it('Export button calls doExport', async () => {
    const user = userEvent.setup()
    const doExport = vi.fn()
    render(<QuestionToolbar {...baseProps} doExport={doExport} />)
    
    await user.click(screen.getByText(/export/i))
    expect(doExport).toHaveBeenCalled()
  })

  it('Shuffle button calls shuffleQuestions', async () => {
    const user = userEvent.setup()
    const shuffleQuestions = vi.fn()
    render(<QuestionToolbar {...baseProps} shuffleQuestions={shuffleQuestions} qsLength={5} />)
    
    await user.click(screen.getByText(/shuffle/i))
    expect(shuffleQuestions).toHaveBeenCalled()
  })

  it('hides add UI when archived', () => {
    render(<QuestionToolbar {...baseProps} archived={true} status="upcoming" />)
    expect(screen.queryByPlaceholderText('Add a question…')).not.toBeInTheDocument()
  })

  it('shows export-only UI for non-upcoming status', () => {
    render(<QuestionToolbar {...baseProps} status="used" />)
    expect(screen.queryByPlaceholderText('Add a question…')).not.toBeInTheDocument()
    expect(screen.getByText(/export used/i)).toBeInTheDocument()
  })
})
