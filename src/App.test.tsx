import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import App from './App'

function getSubmitButton() {
  return screen.getByRole('button', { name: 'Add Exercise' })
}

describe('App', () => {
  it('renders the heading', () => {
    render(<App />)
    expect(screen.getByText('Workout Tracker')).toBeInTheDocument()
  })

  it('shows empty state message', () => {
    render(<App />)
    expect(screen.getByText(/no exercises yet/i)).toBeInTheDocument()
  })

  it('adds an exercise', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Exercise'), 'Bench Press')
    await user.clear(screen.getByLabelText('Sets'))
    await user.type(screen.getByLabelText('Sets'), '4')
    await user.clear(screen.getByLabelText('Reps'))
    await user.type(screen.getByLabelText('Reps'), '8')
    await user.click(getSubmitButton())

    expect(screen.getByText('Bench Press')).toBeInTheDocument()
    expect(screen.getByText('4 × 8')).toBeInTheDocument()
  })

  it('toggles exercise completion', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Exercise'), 'Squats')
    await user.click(getSubmitButton())

    const checkBtn = screen.getByLabelText('Complete Squats')
    await user.click(checkBtn)

    expect(screen.getByText('1/1 exercises completed')).toBeInTheDocument()
  })

  it('removes an exercise', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Exercise'), 'Deadlift')
    await user.click(getSubmitButton())

    expect(screen.getByText('Deadlift')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Remove Deadlift'))

    expect(screen.queryByText('Deadlift')).not.toBeInTheDocument()
  })

  it('does not add exercise with empty name', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(getSubmitButton())

    expect(screen.getByText(/no exercises yet/i)).toBeInTheDocument()
  })
})
