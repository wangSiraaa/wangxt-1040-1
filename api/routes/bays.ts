import { Router, type Request, type Response } from 'express'
import * as bayService from '../services/bayService.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await bayService.getBays()
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.patch('/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const { status } = req.body
    const result = await bayService.updateBayStatus(id, status)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/:id/release', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const { operator_name } = req.body
    const result = await bayService.releaseBay(id, operator_name || 'system')
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/:id/force-complete', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const { operator_name } = req.body
    const result = await bayService.forceComplete(id, operator_name || 'system')
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

export default router
