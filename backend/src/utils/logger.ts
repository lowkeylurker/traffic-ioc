// Logger utility

export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  log(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${this.context}] INFO: ${message}`;
    console.log(logMessage, data || '');
  }

  error(message: string, error?: any): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${this.context}] ERROR: ${message}`;
    console.error(logMessage, error || '');
  }

  warn(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${this.context}] WARN: ${message}`;
    console.warn(logMessage, data || '');
  }

  debug(message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [${this.context}] DEBUG: ${message}`;
      console.log(logMessage, data || '');
    }
  }
}
