import { Router, type Request, type Response } from 'express'
import * as timelineService from '../services/timelineService.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit, offset, event_types, bay_id, order_id, start_time, end_time } = req.query

    const eventTypes = event_types
      ? String(event_types).split(',').filter(Boolean)
      : undefined

    const result = await timelineService.getTimelineEvents({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      eventTypes,
      bayId: bay_id ? Number(bay_id) : undefined,
      orderId: order_id ? Number(order_id) : undefined,
      startTime: start_time as string | undefined,
      endTime: end_time as string | undefined,
    })
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.get('/queue', async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit } = req.query
    const result = await timelineService.getQueueTimeline(limit ? Number(limit) : 50)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await timelineService.addTimelineEvent(req.body)
    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message })
  }
})

export default router
