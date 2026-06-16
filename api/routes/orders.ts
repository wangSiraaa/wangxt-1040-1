import { Router, type Request, type Response } from 'express'
import * as orderService from '../services/orderService.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.query
    const result = await orderService.getOrders(status as string | undefined)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const result = await orderService.getOrder(id)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(404).json({ success: false, error: error.message })
  }
})

router.patch('/:id/package', async (req: Request, res: Response): Promise<void> => {
  try {
    const orderId = Number(req.params.id)
    const { service_package, operator_name } = req.body
    const result = await orderService.changePackage(orderId, service_package, operator_name || 'system')
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    const orderId = Number(req.params.id)
    const { reason, operator_name } = req.body
    const result = await orderService.cancelOrder(orderId, reason, operator_name || 'system')
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.patch('/:id/pay', async (req: Request, res: Response): Promise<void> => {
  try {
    const orderId = Number(req.params.id)
    const result = await orderService.payOrder(orderId)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/:id/start-wash', async (req: Request, res: Response): Promise<void> => {
  try {
    const orderId = Number(req.params.id)
    const result = await orderService.startWash(orderId)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

router.post('/:id/overtime-charge', async (req: Request, res: Response): Promise<void> => {
  try {
    const orderId = Number(req.params.id)
    const { amount, operator_name } = req.body
    const result = await orderService.overtimeCharge(orderId, amount, operator_name || 'system')
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

export default router
