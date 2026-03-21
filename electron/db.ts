import { app } from 'electron'
import fs from 'fs/promises'
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

const read = async (): Promise<Todo[]> => {
  try {
    return JSON.parse(await fs.readFile(getPath(), 'utf-8'))
  } catch {
    return []
  }
}

const write = async (todos: Todo[]) => {
  const filePath = getPath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(todos, null, 2), 'utf-8')
  await fs.rename(tmp, filePath)
}

export const getAllTodos = () => read()

export const createTodo = async (title: string): Promise<Todo> => {
  const todos = await read()
  const todo: Todo = {
    id: Date.now(),
    title: title.trim(),
    pomodoroCount: 0,
    totalMinutes: 0,
    completed: false,
    createdAt: new Date().toISOString(),
  }
  await write([...todos, todo])
  return todo
}

export const addPomodoro = async (id: number, minutes: number): Promise<Todo | null> => {
  const todos = await read()
  const todo = todos.find(t => t.id === id)
  if (!todo) return null
  todo.pomodoroCount++
  todo.totalMinutes = (todo.totalMinutes || 0) + minutes
  await write(todos)
  return todo
}

export const toggleComplete = async (id: number): Promise<Todo | null> => {
  const todos = await read()
  const todo = todos.find(t => t.id === id)
  if (!todo) return null
  todo.completed = !todo.completed
  await write(todos)
  return todo
}

export const deleteTodo = async (id: number) => {
  await write((await read()).filter(t => t.id !== id))
}
