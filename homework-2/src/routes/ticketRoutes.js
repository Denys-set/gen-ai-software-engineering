import { Router } from 'express';
import multer from 'multer';
import { ticketController } from '../controllers/ticketController.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Keep uploaded files in memory; parsers work on the buffer directly.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const router = Router();

router.post('/import', upload.single('file'), asyncHandler(ticketController.import));
router.post('/', asyncHandler(ticketController.create));
router.get('/', asyncHandler(ticketController.list));
router.post('/:id/auto-classify', asyncHandler(ticketController.autoClassify));
router.get('/:id/classification-log', asyncHandler(ticketController.getClassificationLog));
router.get('/:id', asyncHandler(ticketController.getById));
router.put('/:id', asyncHandler(ticketController.update));
router.delete('/:id', asyncHandler(ticketController.remove));

export default router;
