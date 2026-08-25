// Re-export dwPrisma for backward compatibility with existing services
import { dwPrisma, Prisma } from './dw-prisma';

export const prisma = dwPrisma;
export { Prisma };
export default prisma;
