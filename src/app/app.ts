import { Component, ChangeDetectorRef, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

type Priority = 'low' | 'medium' | 'high';
type ColumnKey = 'todo' | 'inProgress' | 'done';

interface TaskItem {
  title: string;
  description: string;
  priority: Priority;
  editing: boolean;
  editTitle?: string;
  editDescription?: string;
  editPriority?: Priority;
}

interface TaskState {
  todo: TaskItem[];
  inProgress: TaskItem[];
  done: TaskItem[];
}

interface BoardColumn {
  key: ColumnKey;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  db: any;

  constructor(private cdr: ChangeDetectorRef) {
    this.initDB();
  }

  tasks: TaskState = {
    todo: [],
    inProgress: [],
    done: []
  };

  newTask = '';
  newDesc = '';
  newPriority: Priority = 'low';

  errorMsg = '';
  filter: 'all' | ColumnKey = 'all';
  theme: 'light' | 'dark' = 'light';

  readonly priorities: Priority[] = ['low', 'medium', 'high'];
  readonly columns: BoardColumn[] = [
    { key: 'todo', label: 'Todo', icon: 'list' },
    { key: 'inProgress', label: 'In Progress', icon: 'clock' },
    { key: 'done', label: 'Done', icon: 'check' }
  ];

  history: TaskState[] = [];
  redoStack: TaskState[] = [];
  draggedTask: TaskItem | null = null;
  fromColumn: ColumnKey | '' = '';

  saveHistory() {
    this.history.push(JSON.parse(JSON.stringify(this.tasks)));
    this.redoStack = [];
  }

  undo() {
    if (this.history.length === 0) return;

    this.redoStack.push(JSON.parse(JSON.stringify(this.tasks)));
    this.tasks = this.history.pop()!;

    this.saveTasks();
    this.cdr.detectChanges();
  }

  redo() {
    if (this.redoStack.length === 0) return;

    this.history.push(JSON.parse(JSON.stringify(this.tasks)));
    this.tasks = this.redoStack.pop()!;

    this.saveTasks();
    this.cdr.detectChanges();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcuts(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      this.undo();
    }

    if (e.ctrlKey && e.key === 'y') {
      e.preventDefault();
      this.redo();
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      this.addTask();
    }
  }

  initDB() {
    if (typeof indexedDB === 'undefined') {
      return;
    }

    const request = indexedDB.open('KanbanDB', 1);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('tasks')) {
        db.createObjectStore('tasks', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event: any) => {
      this.db = event.target.result;
      this.loadTasks();
    };
  }

  saveTasks() {
    if (!this.db) return;

    const tx = this.db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');

    store.put({
      id: 1,
      data: this.tasks
    });
  }

  loadTasks() {
    if (!this.db) return;

    const tx = this.db.transaction('tasks', 'readonly');
    const store = tx.objectStore('tasks');

    const request = store.get(1);

    request.onsuccess = () => {
      if (request.result && request.result.data) {
        this.tasks = request.result.data as TaskState;

        this.columns.forEach((column) => {
          this.tasks[column.key].forEach((task) => {
            if (!task.priority) {
              task.priority = 'low';
            }
            task.editing = !!task.editing;
          });
        });

        this.cdr.detectChanges();
      }
    };
  }

  addTask() {
    const title = this.newTask.trim();
    const desc = this.newDesc.trim();

    if (!title) {
      this.errorMsg = "Task cannot be empty";
      return;
    }

    const exists = this.hasDuplicateTitle(title);

    if (exists) {
      this.errorMsg = "Duplicate task not allowed";
      return;
    }

    this.errorMsg = '';

    this.saveHistory();

    this.tasks.todo.push({
      title,
      description: desc,
      priority: this.newPriority,
      editing: false
    });

    this.newTask = '';
    this.newDesc = '';
    this.newPriority = 'low';

    this.saveTasks();
  }

  onDragStart(task: TaskItem, column: ColumnKey) {
    this.draggedTask = task;
    this.fromColumn = column;
  }

  onDragEnd() {
    this.resetDragState();
  }

  allowDrop(event: any) {
    event.preventDefault();
  }

  onDrop(column: ColumnKey) {
    if (!this.draggedTask || !this.fromColumn) return;
    if (column === this.fromColumn) {
      this.resetDragState();
      return;
    }

    this.saveHistory();

    this.tasks[this.fromColumn] =
      this.tasks[this.fromColumn].filter((t: any) => t !== this.draggedTask);

    this.tasks[column].push(this.draggedTask);

    this.resetDragState();

    this.saveTasks();
  }

  editTask(task: TaskItem) {
    if (!task.editing) {
      this.errorMsg = '';
      task.editTitle = task.title;
      task.editDescription = task.description;
      task.editPriority = task.priority;
      task.editing = true;
      return;
    }

    const title = (task.editTitle ?? '').trim();
    const description = (task.editDescription ?? '').trim();
    const priority = task.editPriority ?? task.priority;

    if (!title) {
      this.errorMsg = "Task cannot be empty";
      return;
    }

    if (this.hasDuplicateTitle(title, task)) {
      this.errorMsg = "Duplicate task not allowed";
      return;
    }

    this.errorMsg = '';

    this.saveHistory();

    task.title = title;
    task.description = description;
    task.priority = priority;
    task.editing = false;
    delete task.editTitle;
    delete task.editDescription;
    delete task.editPriority;

    this.saveTasks();
  }

  deleteTask(column: ColumnKey, index: number) {
    this.saveHistory();
    this.tasks[column].splice(index, 1);
    this.saveTasks();
  }

  clearAllTasks() {
    this.saveHistory();
    this.tasks = {
      todo: [],
      inProgress: [],
      done: []
    };
    this.saveTasks();
  }

  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
  }

  getVisibleColumns() {
    return this.columns.filter((column) => this.filter === 'all' || this.filter === column.key);
  }

  getTasks(column: ColumnKey) {
    return this.tasks[column];
  }

  getPriorityLabel(priority: Priority) {
    return `${priority.charAt(0).toUpperCase()}${priority.slice(1)} Priority`;
  }

  private hasDuplicateTitle(title: string, currentTask?: TaskItem) {
    const normalizedTitle = title.trim().toLowerCase();

    return this.columns.some((column) =>
      this.tasks[column.key].some(
        (task) => task !== currentTask && task.title.trim().toLowerCase() === normalizedTitle
      )
    );
  }

  private resetDragState() {
    this.draggedTask = null;
    this.fromColumn = '';
  }
}