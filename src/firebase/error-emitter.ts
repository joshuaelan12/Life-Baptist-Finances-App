'use client';

type Listener = (error: any) => void;

class ErrorEmitter {
  private listeners: { [key: string]: Listener[] } = {};

  on(event: string, listener: Listener) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
    return () => {
      this.listeners[event] = this.listeners[event].filter(l => l !== listener);
    };
  }

  emit(event: string, error: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(l => l(error));
    }
  }
}

export const errorEmitter = new ErrorEmitter();
