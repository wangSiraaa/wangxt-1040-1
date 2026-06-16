import { Router, type Request, type Response } from 'express'
import * as statsService from '../services/statsService.js'

const router = Router()

router.get('/revenue', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await statsService.getRevenueStats()
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.get('/overtime', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await statsService.getOvertimeStats()
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.get('/fault-loss', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await statsService.getFaultLossStats()
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.get('/cancellation', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await statsService.getCancellationStats()
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.get('/overview', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await statsService.getOverview()
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router
