import { Router, type Request, type Response } from 'express'
import * as faultService from '../services/faultService.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.query
    const result = await faultService.getFaults(status as string | undefined)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await faultService.reportFault(req.body)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.patch('/:id/resolve', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const { resolved_by } = req.body
    const result = await faultService.resolveFault(id, resolved_by || 'system')
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await faultService.getFaultStats()
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router
