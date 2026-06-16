import { Router, type Request, type Response } from 'express'
import * as monthlyCardService from '../services/monthlyCardService.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.query
    const result = await monthlyCardService.listMonthlyCards(status as string | undefined)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.get('/:plate_number', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await monthlyCardService.getMonthlyCard(req.params.plate_number)
    if (!result) {
      res.status(404).json({ success: false, error: '月卡不存在' })
      return
    }
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.get('/:plate_number/eligibility', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await monthlyCardService.checkMonthlyCardEligibility(req.params.plate_number)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { operator_name } = req.body
    const result = await monthlyCardService.createMonthlyCard(req.body, operator_name || 'system')
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/:id/use-wash', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const { operator_name } = req.body
    const result = await monthlyCardService.useWash(id, operator_name || 'system')
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/:id/use-reservation', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const { operator_name } = req.body
    const result = await monthlyCardService.useReservation(id, operator_name || 'system')
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/:id/refund-wash', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const { operator_name } = req.body
    const result = await monthlyCardService.refundWash(id, operator_name || 'system')
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/check-expiry', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await monthlyCardService.checkAndExpireMonthlyCards()
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router
