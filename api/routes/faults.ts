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

router.get('/transfers/pending', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await faultService.getPendingTransfers()
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.get('/:id/transfers', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const result = await faultService.getTransfersByFault(id)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.post('/transfers/:id/execute', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const { operator_name } = req.body
    const result = await faultService.executeTransfer(id, operator_name || 'system')
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/transfers/:id/confirm', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const { decision, operator_name, custom_refund_amount } = req.body
    if (!decision || (decision !== 'refund' && decision !== 'requeue')) {
      res.status(400).json({ success: false, error: 'decision must be refund or requeue' })
      return
    }
    const result = await faultService.confirmManualTransfer(
      id,
      decision,
      operator_name || 'system',
      custom_refund_amount ? Number(custom_refund_amount) : undefined,
    )
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

export default router
