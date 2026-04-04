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
  exercises: Array<Record<string, unknown>>
  students: Array<Record<string, unknown>>
  templates: unknown[]
  checkIns: Array<Record<string, unknown>>
}

function createStudentBase(): Record<string, unknown> {
  return {
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
}

function createRootData({
  students,
  exercises = [],
  checkIns = [],
}: {
  students: Array<Record<string, unknown>>
  exercises?: Array<Record<string, unknown>>
  checkIns?: Array<Record<string, unknown>>
}): RootData {
  return {
    folders: [],
    exercises,
    students,
    templates: [],
    checkIns,
  }
}

function createStudentWithProgram(): {
  student: Record<string, unknown>
  exercises: Array<Record<string, unknown>>
  checkIns: Array<Record<string, unknown>>
} {
  const exercises = [
    {
      id: 'exercise-1',
      name: 'Agachamento Livre',
      youtubeUrl: 'https://example.com/agachamento',
      category: 'Membros inferiores',
      muscles: ['Quadríceps'],
    },
  ]

  const student = {
    ...createStudentBase(),
    programs: [
      {
        id: 'program-1',
        name: 'Base Força',
        status: 'active',
        settings: {
          periodType: 'weekly',
          frequency: 2,
          totalWeeks: 1,
          unit: 'kg',
        },
        planning: { mesocycles: [] },
        weeks: {
          sem1: {
            t1: {
              notes: 'Sessão principal da semana',
              exercises: [
                {
                  id: 'training-exercise-1',
                  exerciseId: 'exercise-1',
                  sets: '3',
                  reps: '8',
                  load: '60',
                  rpe: '8',
                  rest: '90s',
                  actualSets: [],
                },
              ],
            },
            t2: {
              notes: '',
              exercises: [],
            },
          },
        },
        months: {},
      },
    ],
    activeProgramId: 'program-1',
  }

  const checkIns = [
    {
      id: 'checkin-2',
      studentId: 'student-1',
      programId: 'program-1',
      createdAt: '2026-02-02T10:00:00.000Z',
      frequencyType: 'weekly',
      status: 'reviewed',
      weight: 79,
      sleepScore: 8,
      fatigueScore: 4,
      painScore: 2,
      stressScore: 3,
      adherenceScore: 92,
      notes: 'Bom progresso',
      coachNotes: 'Continuar com a progressão',
      reviewedAt: '2026-02-03T10:00:00.000Z',
    },
    {
      id: 'checkin-1',
      studentId: 'student-1',
      programId: 'program-1',
      createdAt: '2026-02-01T10:00:00.000Z',
      frequencyType: 'weekly',
      status: 'pending',
      weight: 80,
      sleepScore: 7,
      fatigueScore: 5,
      painScore: 2,
      stressScore: 4,
      adherenceScore: 90,
      notes: 'Semana estável',
      coachNotes: '',
      reviewedAt: '',
    },
  ]

  return { student, exercises, checkIns }
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
  installStorage(createRootData({ students: [] }))
})

describe('Student App shell', () => {
  it('shows empty state when there are no students', async () => {
    render(<App />)
    expect(await screen.findByText('Nenhum aluno encontrado')).toBeInTheDocument()
  })

  it('renders home content for stored selected student', async () => {
    installStorage(createRootData({ students: [createStudentBase()] }), 'student-1')
    render(<App />)

    expect(await screen.findByText('Olá, Ana')).toBeInTheDocument()
    expect(screen.getByText('App do Aluno')).toBeInTheDocument()
  })

  it('navigates via bottom menu and header profile button', async () => {
    const user = userEvent.setup()
    const { student, exercises, checkIns } = createStudentWithProgram()
    installStorage(createRootData({ students: [student], exercises, checkIns }), 'student-1')
    render(<App />)

    await screen.findByText('Olá, Ana')

    await user.click(screen.getByRole('button', { name: 'Treinos' }))
    expect(await screen.findByText('Meus treinos')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Check-ins' }))
    expect(await screen.findByText('Histórico, envio e edição')).toBeInTheDocument()

    expect(screen.queryByRole('navigation', { name: 'Navegação inferior' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Perfil$/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Abrir perfil' }))
    expect(await screen.findByText('Perfil do aluno')).toBeInTheDocument()
  })

  it('executes a training session and saves execution', async () => {
    const user = userEvent.setup()
    const { student, exercises, checkIns } = createStudentWithProgram()
    installStorage(createRootData({ students: [student], exercises, checkIns }), 'student-1')
    render(<App />)

    await screen.findByText('Olá, Ana')
    await user.click(screen.getByRole('button', { name: 'Treinos' }))
    await screen.findByText('Meus treinos')

    expect(await screen.findByRole('button', { name: /Semana 1 • Treino 1/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Executar sessão' }))

    const repsFields = screen.getAllByPlaceholderText('Ex: 8')
    await user.clear(repsFields[0])
    await user.type(repsFields[0], '9')
    const loadFields = screen.getAllByPlaceholderText('Ex: 60')
    await user.clear(loadFields[0])
    await user.type(loadFields[0], '62.5')

    await user.click(screen.getByRole('button', { name: 'Salvar execução' }))
    expect(await screen.findByText('Execução salva localmente.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar execução' })).toBeInTheDocument()
  })

  it('creates and edits a pending check-in', async () => {
    const user = userEvent.setup()
    const { student, exercises, checkIns } = createStudentWithProgram()
    installStorage(createRootData({ students: [student], exercises, checkIns }), 'student-1')
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

    await user.click(screen.getAllByRole('button', { name: 'Editar' })[0])
    expect(await screen.findByText('Editar check-in')).toBeInTheDocument()
    await user.clear(screen.getByPlaceholderText('Ex: 82.5'))
    await user.type(screen.getByPlaceholderText('Ex: 82.5'), '81')
    await user.click(screen.getByRole('button', { name: 'Salvar check-in' }))

    expect(await screen.findByText('Check-in atualizado com sucesso.')).toBeInTheDocument()
    expect(screen.getAllByText('81 kg')[0]).toBeInTheDocument()
  })

  it('edits only profile contact fields from profile area', async () => {
    const user = userEvent.setup()
    const { student, exercises, checkIns } = createStudentWithProgram()
    installStorage(createRootData({ students: [student], exercises, checkIns }), 'student-1')
    render(<App />)

    await screen.findByText('Olá, Ana')
    await user.click(screen.getByRole('button', { name: 'Abrir perfil' }))
    await screen.findByText('Perfil do aluno')

    await user.click(screen.getByRole('button', { name: 'Editar contato' }))
    await user.clear(screen.getByLabelText('Email'))
    await user.type(screen.getByLabelText('Email'), 'ana.nova@example.com')
    await user.clear(screen.getByLabelText('Telefone'))
    await user.type(screen.getByLabelText('Telefone'), '11911112222')
    await user.click(screen.getByRole('button', { name: 'Salvar contato' }))

    expect(await screen.findByText('Contato atualizado com sucesso.')).toBeInTheDocument()
    expect(screen.getByText('ana.nova@example.com')).toBeInTheDocument()
    expect(screen.getByText('11911112222')).toBeInTheDocument()
  })
})
