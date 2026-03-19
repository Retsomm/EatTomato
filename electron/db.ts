import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export interface Todo {
  id: number
  title: string
  pomodoroCount: number
  totalMinutes: number
  completed: boolean
  createdAt: string
}

const getPath = () => path.join(app.getPath('userData'), 'todos.json')

const read = (): Todo[] => {
  try {
    return JSON.parse(fs.readFileSync(getPath(), 'utf-8'))
  } catch {
    return []
  }
}

const write = (todos: Todo[]) => {
  const filePath = getPath()
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(todos, null, 2), 'utf-8')
  fs.renameSync(tmp, filePath)
}

export const getAllTodos = () => read()

export const createTodo = (title: string): Todo => {
  const todos = read()
  const todo: Todo = {
    id: Date.now(),
    title: title.trim(),
    pomodoroCount: 0,
    totalMinutes: 0,
    completed: false,
    createdAt: new Date().toISOString(),
  }
  write([...todos, todo])
  return todo
}

export const addPomodoro = (id: number, minutes: number): Todo | null => {
  const todos = read()
  const todo = todos.find(t => t.id === id)
  if (!todo) return null
  todo.pomodoroCount++
  todo.totalMinutes = (todo.totalMinutes || 0) + minutes
  write(todos)
  return todo
}

export const toggleComplete = (id: number): Todo | null => {
  const todos = read()
  const todo = todos.find(t => t.id === id)
  if (!todo) return null
  todo.completed = !todo.completed
  write(todos)
  return todo
}

export const deleteTodo = (id: number) => {
  write(read().filter(t => t.id !== id))
}
