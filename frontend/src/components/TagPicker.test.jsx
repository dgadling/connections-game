import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TagPicker } from './TagPicker.jsx'

describe('TagPicker', () => {
  it('renders with correct tag icon', () => {
    render(<TagPicker tag="tension" onChange={() => {}} />)
    const button = screen.getByRole('button', { name: /change tag: tension/i })
    expect(button).toBeInTheDocument()
    // tension tag icon is ⚡
    expect(button).toHaveTextContent('⚡')
  })

  it('clicking button opens dropdown', async () => {
    const user = userEvent.setup()
    render(<TagPicker tag="warm" onChange={() => {}} />)
    const button = screen.getByRole('button', { name: /change tag: warm/i })
    await user.click(button)
    // Dropdown should show tag options
    expect(screen.getByText('tension')).toBeInTheDocument()
    expect(screen.getByText('secretive')).toBeInTheDocument()
    expect(screen.getByText('warm')).toBeInTheDocument()
  })

  it('clicking a tag calls onChange with correct value and closes dropdown', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TagPicker tag="warm" onChange={onChange} />)
    const button = screen.getByRole('button', { name: /change tag: warm/i })
    await user.click(button)
    const tensionOption = screen.getByText('tension')
    await user.click(tensionOption)
    expect(onChange).toHaveBeenCalledWith('tension')
    expect(onChange).toHaveBeenCalledTimes(1)
    // Dropdown should close
    expect(screen.queryByText('secretive')).not.toBeInTheDocument()
  })

  it('escape key closes dropdown', async () => {
    const user = userEvent.setup()
    render(<TagPicker tag="warm" onChange={() => {}} />)
    const button = screen.getByRole('button', { name: /change tag: warm/i })
    await user.click(button)
    expect(screen.getByText('tension')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByText('tension')).not.toBeInTheDocument()
  })

  it('click outside closes dropdown', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <TagPicker tag="warm" onChange={() => {}} />
        <button type="button">outside</button>
      </div>
    )
    const pickerButton = screen.getByRole('button', { name: /change tag: warm/i })
    await user.click(pickerButton)
    expect(screen.getByText('tension')).toBeInTheDocument()
    const outsideButton = screen.getByRole('button', { name: 'outside' })
    await user.click(outsideButton)
    expect(screen.queryByText('tension')).not.toBeInTheDocument()
  })

  it('disabled prop prevents opening', async () => {
    const user = userEvent.setup()
    render(<TagPicker tag="warm" onChange={() => {}} disabled={true} />)
    const button = screen.getByRole('button', { name: /change tag: warm/i })
    expect(button).toBeDisabled()
    await user.click(button)
    // Dropdown should NOT open
    expect(screen.queryByText('tension')).not.toBeInTheDocument()
  })
})
