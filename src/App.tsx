import { useState } from 'react'
import './App.css'

interface Exercise {
  id: number
  name: string
  sets: number
  reps: number
  completed: boolean
}

function App() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [name, setName] = useState('')
  const [sets, setSets] = useState(3)
  const [reps, setReps] = useState(10)

  const addExercise = () => {
    if (!name.trim()) return
    const exercise: Exercise = {
      id: Date.now(),
      name: name.trim(),
      sets,
      reps,
      completed: false,
    }
    setExercises((prev) => [...prev, exercise])
    setName('')
    setSets(3)
    setReps(10)
  }

  const toggleComplete = (id: number) => {
    setExercises((prev) =>
      prev.map((ex) => (ex.id === id ? { ...ex, completed: !ex.completed } : ex))
    )
  }

  const removeExercise = (id: number) => {
    setExercises((prev) => prev.filter((ex) => ex.id !== id))
  }

  const completedCount = exercises.filter((ex) => ex.completed).length

  return (
    <div className="app">
      <header>
        <h1>Workout Tracker</h1>
        {exercises.length > 0 && (
          <p className="progress">
            {completedCount}/{exercises.length} exercises completed
          </p>
        )}
      </header>

      <section className="add-exercise" aria-label="Add exercise">
        <h2>Add Exercise</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            addExercise()
          }}
        >
          <div className="form-row">
            <label htmlFor="exercise-name">Exercise</label>
            <input
              id="exercise-name"
              type="text"
              placeholder="e.g. Bench Press"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-row-inline">
            <div className="form-field">
              <label htmlFor="sets">Sets</label>
              <input
                id="sets"
                type="number"
                min={1}
                max={20}
                value={sets}
                onChange={(e) => setSets(Number(e.target.value))}
              />
            </div>
            <div className="form-field">
              <label htmlFor="reps">Reps</label>
              <input
                id="reps"
                type="number"
                min={1}
                max={100}
                value={reps}
                onChange={(e) => setReps(Number(e.target.value))}
              />
            </div>
          </div>
          <button type="submit">Add Exercise</button>
        </form>
      </section>

      <section className="exercise-list" aria-label="Exercise list">
        <h2>Today&apos;s Workout</h2>
        {exercises.length === 0 ? (
          <p className="empty">No exercises yet. Add one above!</p>
        ) : (
          <ul>
            {exercises.map((ex) => (
              <li key={ex.id} className={ex.completed ? 'completed' : ''}>
                <div className="exercise-info">
                  <button
                    className="check-btn"
                    onClick={() => toggleComplete(ex.id)}
                    aria-label={ex.completed ? `Unmark ${ex.name}` : `Complete ${ex.name}`}
                  >
                    {ex.completed ? '✅' : '⬜'}
                  </button>
                  <span className="exercise-name">{ex.name}</span>
                  <span className="exercise-detail">
                    {ex.sets} × {ex.reps}
                  </span>
                </div>
                <button
                  className="remove-btn"
                  onClick={() => removeExercise(ex.id)}
                  aria-label={`Remove ${ex.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default App
