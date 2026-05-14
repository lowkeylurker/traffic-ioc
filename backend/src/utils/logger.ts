import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
// import * as Sentry from '@sentry/node';

const logDir = 'logs';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.printf(
    (info: winston.Logform.TransformableInfo) => `[${info.timestamp}] [${(info as any).context || 'Global'}] ${info.level.toUpperCase()}: ${info.message}`
  )
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info: winston.Logform.TransformableInfo) => `[${info.timestamp}] [${(info as any).context || 'Global'}] ${info.level}: ${info.message}`
  )
);

const transports = [
  new winston.transports.Console({
    format: consoleFormat,
  }),
  new winston.transports.DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    level: 'error',
  }),
  new winston.transports.DailyRotateFile({
    filename: path.join(logDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
  }),
];

const winstonLogger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  levels,
  format,
  transports,
});

export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  log(message: string, data?: any): void {
    const msg = data ? `${message} ${JSON.stringify(data)}` : message;
    winstonLogger.info(msg, { context: this.context });
    // Sentry.addBreadcrumb({
    //   category: 'log',
    //   message: msg,
    //   level: 'info',
    //   data: { context: this.context },
    // });
  }

  info(message: string, data?: any): void {
    this.log(message, data);
  }

  error(message: string, error?: any): void {
    let msg = message;
    if (error) {
      if (error instanceof Error) {
        msg = `${message}: ${error.message}`;
        winstonLogger.error(`${msg}\n${error.stack}`, { context: this.context });
        // Sentry.withScope((scope) => {
        //   scope.setTag('context', this.context);
        //   Sentry.captureException(error);
        // });
      } else {
        msg = `${message} ${JSON.stringify(error)}`;
        winstonLogger.error(msg, { context: this.context });
        // Sentry.withScope((scope) => {
        //   scope.setTag('context', this.context);
        //   Sentry.captureMessage(msg, 'error');
        // });
      }
    } else {
      winstonLogger.error(message, { context: this.context });
      // Sentry.captureMessage(message, 'error');
    }
  }

  warn(message: string, data?: any): void {
    const msg = data ? `${message} ${JSON.stringify(data)}` : message;
    winstonLogger.warn(msg, { context: this.context });
    // Sentry.addBreadcrumb({
    //   category: 'log',
    //   message: msg,
    //   level: 'warning',
    //   data: { context: this.context },
    // });
  }

  debug(message: string, data?: any): void {
    const msg = data ? `${message} ${JSON.stringify(data)}` : message;
    winstonLogger.debug(msg, { context: this.context });
  }

  http(message: string, data?: any): void {
    const msg = data ? `${message} ${JSON.stringify(data)}` : message;
    winstonLogger.http(msg, { context: this.context });
  }
}
