import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuestionItem } from './QuestionItem.jsx'

const baseQuestion = {
  id: 1,
  text: 'What scares you?',
  tag: 'vulnerable',
  tag_auto: true,
  edit_count: 0,
}

const baseProps = {
  q: baseQuestion,
  idx: 0,
  status: 'upcoming',
  editing: null,
  editText: '',
  setEditText: vi.fn(),
  onSaveEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onSetTag: vi.fn(),
  onRevertTag: vi.fn(),
  onEditStart: vi.fn(),
  onOpenHistory: vi.fn(),
  onGraveyard: vi.fn(),
  onRestore: vi.fn(),
  onDelete: vi.fn(),
  dragIdx: null,
  onDragStart: () => () => {},
  onDragOver: () => () => {},
  onDragEnd: vi.fn(),
  onGripTouch: () => () => {},
  saving: false,
}

describe('QuestionItem', () => {
  it('renders question text', () => {
    render(<QuestionItem {...baseProps} />)
    expect(screen.getByText('What scares you?')).toBeInTheDocument()
  })

  it('shows TagPicker for upcoming status', () => {
    render(<QuestionItem {...baseProps} status="upcoming" />)
    // TagPicker renders a button with aria-label "change tag: vulnerable"
    expect(screen.getByRole('button', { name: /change tag: vulnerable/i })).toBeInTheDocument()
  })

  it('shows tag icon (not picker) for non-upcoming status', () => {
    render(<QuestionItem {...baseProps} status="used" />)
    // Should NOT show TagPicker
    expect(screen.queryByRole('button', { name: /change tag/i })).not.toBeInTheDocument()
    // Should show tag icon with title
    expect(screen.getByTitle('vulnerable')).toBeInTheDocument()
  })

  it('shows edit button and calls onEditStart', async () => {
    const user = userEvent.setup()
    const onEditStart = vi.fn()
    render(<QuestionItem {...baseProps} onEditStart={onEditStart} />)
    
    await user.click(screen.getByTitle('Edit'))
    expect(onEditStart).toHaveBeenCalledWith(baseQuestion)
  })

  it('shows history button when edit_count > 0', () => {
    render(<QuestionItem {...baseProps} q={{ ...baseQuestion, edit_count: 2 }} />)
    expect(screen.getByTitle('History')).toBeInTheDocument()
  })

  it('hides history button when edit_count is 0', () => {
    render(<QuestionItem {...baseProps} q={{ ...baseQuestion, edit_count: 0 }} />)
    expect(screen.queryByTitle('History')).not.toBeInTheDocument()
  })

  it('shows graveyard button for upcoming status', async () => {
    const user = userEvent.setup()
    const onGraveyard = vi.fn()
    render(<QuestionItem {...baseProps} status="upcoming" onGraveyard={onGraveyard} />)
    
    await user.click(screen.getByTitle('Graveyard'))
    expect(onGraveyard).toHaveBeenCalledWith(baseQuestion)
  })

  it('shows restore/delete buttons for graveyard status', () => {
    render(<QuestionItem {...baseProps} status="graveyard" />)
    expect(screen.getByTitle('Restore')).toBeInTheDocument()
    expect(screen.getByTitle('Delete permanently')).toBeInTheDocument()
  })

  it('shows revert tag button when tag_auto is false', () => {
    render(<QuestionItem {...baseProps} q={{ ...baseQuestion, tag_auto: false }} />)
    expect(screen.getByTitle('Revert to auto')).toBeInTheDocument()
  })

  it('hides revert tag button when tag_auto is true', () => {
    render(<QuestionItem {...baseProps} q={{ ...baseQuestion, tag_auto: true }} />)
    expect(screen.queryByTitle('Revert to auto')).not.toBeInTheDocument()
  })

  it('enters edit mode when editing matches q.id', () => {
    render(<QuestionItem {...baseProps} editing={1} editText="edited text" />)
    expect(screen.getByDisplayValue('edited text')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('calls onSaveEdit when Save is clicked', async () => {
    const user = userEvent.setup()
    const onSaveEdit = vi.fn()
    render(<QuestionItem {...baseProps} editing={1} editText="foo" onSaveEdit={onSaveEdit} />)
    
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(onSaveEdit).toHaveBeenCalledWith(baseQuestion)
  })

  it('calls onCancelEdit when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onCancelEdit = vi.fn()
    render(<QuestionItem {...baseProps} editing={1} editText="foo" onCancelEdit={onCancelEdit} />)
    
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancelEdit).toHaveBeenCalled()
  })

  it('disables buttons when saving is true', () => {
    render(<QuestionItem {...baseProps} saving={true} />)
    expect(screen.getByTitle('Edit')).toBeDisabled()
    expect(screen.getByTitle('Graveyard')).toBeDisabled()
  })

  it('applies dragging opacity when dragIdx matches', () => {
    const { container } = render(<QuestionItem {...baseProps} dragIdx={0} idx={0} />)
    const itemDiv = container.querySelector('[data-q-idx="0"]')
    expect(itemDiv.className).toContain('opacity-40')
  })
})
