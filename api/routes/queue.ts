import { Router, type Request, type Response } from 'express'
import * as queueService from '../services/queueService.js'

const router = Router()

router.post('/check-eligibility', async (req: Request, res: Response): Promise<void> => {
  try {
    const { car_type, service_package, payment_method, plate_number, estimated_arrival_minutes } = req.body
    const result = await queueService.checkEligibility(car_type, service_package, payment_method, plate_number, estimated_arrival_minutes)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/join', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await queueService.joinQueue(req.body)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await queueService.getQueue()
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.post('/call-next', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await queueService.callNext()
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const result = await queueService.leaveQueue(id)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

export default router
