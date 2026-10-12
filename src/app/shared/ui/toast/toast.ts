import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: ToastAction;
  timestamp: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private readonly _toasts = signal<ToastMessage[]>([]);
  public readonly toasts = this._toasts.asReadonly();

  private counter = 0;

  public show(
    message: string,
    type: ToastType = 'info',
    duration = 3200,
    action?: ToastAction,
  ): string {
    const id = `toast-${Date.now()}-${++this.counter}`;
    const newToast: ToastMessage = {
      id,
      message,
      type,
      duration,
      action,
      timestamp: Date.now(),
    };

    this._toasts.update((current) => [...current, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  public success(message: string, duration = 3000, action?: ToastAction): string {
    return this.show(message, 'success', duration, action);
  }

  public error(message: string, duration = 4500, action?: ToastAction): string {
    return this.show(message, 'error', duration, action);
  }

  public info(message: string, duration = 3000, action?: ToastAction): string {
    return this.show(message, 'info', duration, action);
  }

  public warning(message: string, duration = 3800, action?: ToastAction): string {
    return this.show(message, 'warning', duration, action);
  }

  public dismiss(id: string): void {
    this._toasts.update((current) => current.filter((t) => t.id !== id));
  }

  public clear(): void {
    this._toasts.set([]);
  }
}
