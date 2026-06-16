import { Router, type Request, type Response } from 'express'
import * as operationLogService from '../services/operationLogService.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Number(req.query.limit) || 50
    const offset = Number(req.query.offset) || 0
    const result = await operationLogService.getLogs(limit, offset)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await operationLogService.addLog(req.body)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

export default router
