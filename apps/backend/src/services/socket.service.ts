import { Server, Socket } from 'socket.io';
import { Logger } from '../utils/logger';

const logger = new Logger('SocketService');

export class SocketService {
  private io: Server | null = null;

  /**
   * Khởi tạo Gateway Socket.io
   * @param io Express HTTP Server bọc Socket.io
   */
  setupSocketGateway(io: Server): void {
    this.io = io;

    // Cấu hình Authentication & Connection Middleware
    this.io.use((socket: Socket, next) => {
      const userId = socket.handshake.query.userId as string;
      
      if (!userId) {
        logger.warn(`❌ Socket rejected: userId is missing in handshake query. IP: ${socket.handshake.address}`);
        return next(new Error('Authentication error: userId missing'));
      }

      // Gắn userId vào socket instance để dễ quản lý
      (socket as any).userId = userId;
      next();
    });

    this.io.on('connection', (socket: Socket) => {
      const userId = (socket as any).userId;
      const roomName = `user:${userId}`;
      
      // Cho client join vào room của chính họ để dễ dàng emit cá nhân hóa
      socket.join(roomName);
      
      logger.log(`⚡ Admin connected: userId = ${userId}, socketId = ${socket.id}. Joined room: ${roomName}`);

      socket.on('disconnect', () => {
        logger.log(`🔌 Admin disconnected: userId = ${userId}, socketId = ${socket.id}`);
      });
    });

    logger.log('✓ Socket.io Gateway setup and secured successfully.');
  }

  /**
   * Phát thông báo realtime tới một người dùng cụ thể thông qua room
   * @param userId ID người dùng cần nhận thông báo
   * @param event Tên sự kiện socket
   * @param data Dữ liệu payload gửi kèm
   */
  emitToUser(userId: string, event: string, data: any): boolean {
    if (!this.io) {
      logger.error(`❌ Socket.io has not been initialized. Cannot emit ${event} to user ${userId}`);
      return false;
    }

    const roomName = `user:${userId}`;
    this.io.to(roomName).emit(event, data);
    
    logger.log(`📡 Broadcasted event [${event}] to room [${roomName}] successfully.`);
    return true;
  }
}

export const socketService = new SocketService();
