import { Router, type Request, type Response } from 'express'
import * as reservationService from '../services/reservationService.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, start_date, end_date } = req.query
    const result = await reservationService.listReservations(
      status as string | undefined,
      start_date as string | undefined,
      end_date as string | undefined,
    )
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.get('/available-slots', async (req: Request, res: Response): Promise<void> => {
  try {
    const { date } = req.query
    const dateObj = date ? new Date(String(date)) : new Date()
    const dateStr = dateObj.toISOString().split('T')[0]
    const result = await reservationService.getAvailableTimeSlots(dateStr)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await reservationService.createReservation(req.body)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/:id/check-in', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const result = await reservationService.checkInReservation({
      reservation_id: id,
      ...req.body,
    })
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/:id/skip-line', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const { operator_name } = req.body
    const result = await reservationService.vipSkipLine(id, operator_name || 'system')
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/:id/no-show', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const { operator_name } = req.body
    const result = await reservationService.markNoShow(id, operator_name || 'system')
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const { reason, operator_name } = req.body
    const result = await reservationService.cancelReservation(
      id,
      reason || '用户取消',
      operator_name || 'system',
    )
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/check-expiry', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await reservationService.checkAndExpireReservations()
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router
