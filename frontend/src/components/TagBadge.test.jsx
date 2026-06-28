import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TagBadge, TagIcon, TAGS, TAG_ICONS } from './TagBadge.jsx'

describe('TagBadge', () => {
  it('renders tag text with correct class', () => {
    render(<TagBadge tag="warm" />)
    const badge = screen.getByText('warm')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('tag-warm')
  })

  it('returns null when tag is falsy', () => {
    const { container } = render(<TagBadge tag={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders all 6 tags with correct styling', () => {
    TAGS.forEach(tag => {
      const { unmount } = render(<TagBadge tag={tag} />)
      const badge = screen.getByText(tag)
      expect(badge).toBeInTheDocument()
      unmount()
    })
  })

  it('applies custom className', () => {
    render(<TagBadge tag="tension" className="my-custom-class" />)
    const badge = screen.getByText('tension')
    expect(badge.className).toContain('my-custom-class')
  })
})

describe('TagIcon', () => {
  it('renders correct icon for each tag', () => {
    Object.entries(TAG_ICONS).forEach(([tag, icon]) => {
      const { unmount } = render(<TagIcon tag={tag} />)
      const el = screen.getByTitle(tag)
      expect(el).toHaveTextContent(icon)
      unmount()
    })
  })

  it('falls back to • for unknown tag', () => {
    render(<TagIcon tag="unknown_tag_xyz" />)
    const el = screen.getByTitle('unknown_tag_xyz')
    expect(el).toHaveTextContent('•')
  })

  it('applies tag color class', () => {
    render(<TagIcon tag="vulnerable" />)
    const el = screen.getByTitle('vulnerable')
    expect(el.className).toContain('tag-vulnerable')
  })
})
