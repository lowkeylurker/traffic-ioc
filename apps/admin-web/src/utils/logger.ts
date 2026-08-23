// import * as Sentry from '@sentry/react';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toLocaleTimeString();
    return `[${timestamp}] [${this.context}] ${level.toUpperCase()}: ${message}`;
  }

  log(message: string, data?: unknown): void {
    this.info(message, data);
  }

  info(message: string, data?: unknown): void {
    console.log(this.formatMessage('info', message), data || '');
  }

  warn(message: string, data?: unknown): void {
    console.warn(this.formatMessage('warn', message), data || '');
  }

  error(message: string, error?: unknown): void {
    const formattedMessage = this.formatMessage('error', message);
    console.error(formattedMessage, error || '');

    // Send to Sentry
    // Sentry.withScope((scope) => {
    //   scope.setTag('context', this.context);
    //   if (error instanceof Error) {
    //     Sentry.captureException(error);
    //   } else {
    //     Sentry.captureMessage(`${message} ${JSON.stringify(error)}`, 'error');
    //   }
    // });
  }

  debug(message: string, data?: unknown): void {
    if (import.meta.env.DEV) {
      console.log(this.formatMessage('debug', message), data || '');
    }
  }
}
