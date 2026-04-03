import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

const STORAGE_KEY = 'pl-coach-data'
const SELECTED_STUDENT_KEY = 'pl-student-app-selected-student'

type LocalStorageBridge = {
  get: (key: string) => Promise<{ value: string | null }>
  set: (key: string, value: string) => Promise<void>
}

type RootData = {
  folders: unknown[]
  exercises: unknown[]
  students: Array<Record<string, unknown>>
  templates: unknown[]
  checkIns: Array<Record<string, unknown>>
}

const studentBase = {
  id: 'student-1',
  name: 'Ana',
  status: 'Ativo',
  goal: 'Hipertrofia',
  email: 'ana@example.com',
  phone: '11999999999',
  birthDate: '1999-01-01',
  gender: 'Feminino',
  measurements: {},
  checkInSettings: { frequency: 'Semanal' },
  context: {
    detailedGoal: '',
    currentFocus: 'Foco em técnica',
    modality: 'Musculação',
    level: 'Intermediário',
    weakPoints: '',
    technicalNotes: '',
  },
  programs: [],
  activeProgramId: '',
}

function createRootData(students: Array<Record<string, unknown>>): RootData {
  return {
    folders: [],
    exercises: [],
    students,
    templates: [],
    checkIns: [],
  }
}

function installStorage(rootData: RootData, selectedStudentId = '') {
  const db = new Map<string, string>([
    [STORAGE_KEY, JSON.stringify(rootData)],
    [SELECTED_STUDENT_KEY, selectedStudentId],
  ])

  const storage: LocalStorageBridge = {
    get: async (key) => ({ value: db.get(key) ?? null }),
    set: async (key, value) => {
      db.set(key, value)
    },
  }

  ;(window as unknown as Window & { storage: LocalStorageBridge }).storage = storage
}

beforeEach(() => {
  installStorage(createRootData([]))
})

describe('Student App shell', () => {
  it('shows empty state when there are no students', async () => {
    render(<App />)
    expect(await screen.findByText('Nenhum aluno encontrado')).toBeInTheDocument()
  })

  it('renders home content for stored selected student', async () => {
    installStorage(createRootData([studentBase]), 'student-1')
    render(<App />)

    expect(await screen.findByText('Olá, Ana')).toBeInTheDocument()
    expect(screen.getByText('App do Aluno')).toBeInTheDocument()
  })

  it('navigates between tabs from bottom menu', async () => {
    const user = userEvent.setup()
    installStorage(createRootData([studentBase]), 'student-1')
    render(<App />)

    await screen.findByText('Olá, Ana')

    await user.click(screen.getByRole('button', { name: 'Treinos' }))
    expect(await screen.findByText('Meus treinos')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Check-ins' }))
    expect(await screen.findByText('Histórico, envio e edição')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Perfil' }))
    expect(await screen.findByText('Perfil do aluno')).toBeInTheDocument()
  })

  it('creates a new pending check-in', async () => {
    const user = userEvent.setup()
    installStorage(createRootData([studentBase]), 'student-1')
    render(<App />)

    await screen.findByText('Olá, Ana')
    await user.click(screen.getByRole('button', { name: 'Check-ins' }))
    await screen.findByText('Histórico, envio e edição')

    await user.click(screen.getByRole('button', { name: 'Novo check-in' }))
    await user.type(screen.getByPlaceholderText('Ex: 82.5'), '80')
    await user.type(
      screen.getByPlaceholderText(
        'Como foi a semana? Alguma dor, dificuldade, falta de energia, alteração de rotina, etc.',
      ),
      'Semana boa',
    )
    await user.click(screen.getByRole('button', { name: 'Salvar check-in' }))

    expect(await screen.findByText('Check-in enviado com sucesso.')).toBeInTheDocument()
    expect(screen.getAllByText('80 kg')[0]).toBeInTheDocument()
  })
})
