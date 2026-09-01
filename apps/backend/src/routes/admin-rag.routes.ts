import { Router } from 'express';
import multer from 'multer';
import { adminRagController } from '../controllers/admin-rag.controller';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// Document catalog & chunks
router.get('/', adminRagController.listDocuments);
router.get('/stream', adminRagController.streamGlobalProgress);
router.get('/:docId/chunks', adminRagController.getDocumentChunks);

// File upload & ingestion streaming
router.post('/upload', upload.single('file'), adminRagController.uploadDocument);
router.post('/upload-stream', upload.single('file'), adminRagController.uploadDocumentDirectStream);
router.get('/jobs/:jobId/stream', adminRagController.streamJobProgress);

// Document deletion & re-indexing
router.delete('/:docId', adminRagController.deleteDocument);
router.post('/:docId/reindex', adminRagController.reindexDocument);

export default router;
