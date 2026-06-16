import { useEffect, useState, useCallback } from 'react'
import { fetchBays, fetchQueue, fetchOverview, releaseBay, forceCompleteBay, callNext, leaveQueue } from '@/lib/api'
import { Car, Clock, Wrench, Users, AlertTriangle, Bell, CheckCircle } from 'lucide-react'
import { useAppStore, ROLE_PERMISSIONS } from '@/store/useAppStore'

const statusMap: Record<string, { label: string; color: string; bg: string }> = {
  idle: { label: '空闲', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  occupied: { label: '洗车中', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  fault: { label: '故障', color: 'text-orange-400', bg: 'bg-orange-500/20' },
  overtime: { label: '超时', color: 'text-red-400', bg: 'bg-red-500/20' },
}

const pkgLabels: Record<string, string> = { standard: '标准洗', premium: '精洗', interior: '内饰+外观', full: '全套' }

function useElapsed(startedAt?: string) {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    if (!startedAt) return
    const calc = () => {
      const ms = Date.now() - new Date(startedAt).getTime()
      const m = Math.floor(ms / 60000)
      const s = Math.floor((ms % 60000) / 1000)
      setElapsed(`${m}分${s}秒`)
    }
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [startedAt])
  return elapsed
}

function BayCard({ bay, onAction, canManage }: { bay: any; onAction: (bay: any, action: string) => void; canManage: boolean }) {
  const s = statusMap[bay.status] || statusMap.idle
  const elapsed = useElapsed(bay.started_at || bay.updated_at)
  const isAlert = bay.status === 'fault' || bay.status === 'overtime'

  const primaryAction = bay.status === 'idle' ? 'call' : bay.status === 'occupied' ? 'complete' : bay.status === 'fault' ? 'view' : 'force'
  const primaryLabel = bay.status === 'idle' ? '叫号' : bay.status === 'occupied' ? '完成' : bay.status === 'fault' ? '查看详情' : '强制完成'
  const primaryColor = bay.status === 'idle' ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30' :
    bay.status === 'occupied' ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30' :
    bay.status === 'fault' ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30' :
    'bg-red-500/20 text-red-400 hover:bg-red-500/30'

  return (
    <div className={`bg-slate-800 rounded-lg p-5 border border-white/10 shadow ${isAlert ? 'animate-pulse' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl font-bold">{bay.name || `车位${bay.id}`}</span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.color}`}>{s.label}</span>
      </div>
      {bay.status === 'occupied' || bay.status === 'overtime' ? (
        <div className="space-y-1 text-sm text-slate-300 mb-3">
          <div className="flex items-center gap-1"><Car size={14} /> <span className="font-mono">{bay.plate_number || '—'}</span></div>
          <div className="flex items-center gap-1"><Clock size={14} /> <span className="font-mono">{elapsed}</span></div>
          <div>套餐: {pkgLabels[bay.service_package] || bay.service_package || '—'}</div>
          {bay.overtime_amount > 0 && (
            <div className="text-yellow-400 font-semibold">超时: ¥{bay.overtime_amount}</div>
          )}
        </div>
      ) : bay.status === 'fault' ? (
        <div className="text-sm text-orange-400 mb-3">
          <div className="flex items-center gap-1"><AlertTriangle size={14} /> 设备故障，暂停服务</div>
          {bay.fault_description && <div className="text-xs mt-1 opacity-80">{bay.fault_description}</div>}
        </div>
      ) : (
        <div className="text-sm text-slate-500 mb-3">等待分配</div>
      )}
      {canManage ? (
        <button
          onClick={() => onAction(bay, primaryAction)}
          className={`w-full py-2 rounded text-sm font-medium transition-colors ${primaryColor}`}
        >
          {primaryLabel}
        </button>
      ) : (
        <div className="w-full py-2 rounded text-sm font-medium bg-white/5 text-slate-500 text-center">
          {bay.status === 'idle' ? '待分配' : bay.status === 'occupied' ? '进行中' : bay.status === 'fault' ? '维修中' : '处理中'}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { currentRole, bayRefreshTrigger } = useAppStore()
  const perms = ROLE_PERMISSIONS[currentRole]
  const canManage = perms.canManageQueue || perms.canReleaseBay

  const [bays, setBays] = useState<any[]>([])
  const [queue, setQueue] = useState<any[]>([])
  const [overview, setOverview] = useState<any>(null)
  const [notifications, setNotifications] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [b, q, o] = await Promise.all([fetchBays(), fetchQueue(), fetchOverview()])
      setBays(b)
      setQueue(q)
      setOverview(o)

      const newNotifications: string[] = []
      const faultBays = b.filter((bay: any) => bay.status === 'fault')
      const overtimeBays = b.filter((bay: any) => bay.status === 'overtime')
      if (faultBays.length > 0) newNotifications.push(`⚠️ ${faultBays.length}个车位处于故障状态`)
      if (overtimeBays.length > 0) newNotifications.push(`⏱️ ${overtimeBays.length}个车位已超时`)
      if (q.length >= 5) newNotifications.push(`👥 排队车辆较多(${q.length}辆)，建议加快处理`)
      setNotifications(newNotifications)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh, bayRefreshTrigger])

  const handleBayAction = async (bay: any, action: string) => {
    try {
      if (action === 'call') {
        if (!perms.canManageQueue) { alert('无权限'); return }
        await callNext()
      }
      else if (action === 'complete') {
        if (!perms.canReleaseBay) { alert('无权限'); return }
        await releaseBay(bay.id, currentRole)
      }
      else if (action === 'force') {
        if (!perms.canReleaseBay) { alert('无权限'); return }
        await forceCompleteBay(bay.id, currentRole)
      }
      refresh()
    } catch (e: any) { alert(e.message) }
  }

  const handleQueueAction = async (entry: any, action: string) => {
    try {
      if (action === 'call') {
        if (!perms.canManageQueue) { alert('无权限'); return }
        await callNext()
      }
      else if (action === 'cancel') {
        if (!perms.canCancelOrder) { alert('无权限'); return }
        await leaveQueue(entry.id)
      }
      refresh()
    } catch (e: any) { alert(e.message) }
  }

  if (loading) return <div className="flex items-center justify-center h-96 text-slate-400">加载中...</div>

  const roleTitle: Record<string, string> = {
    '车主': '我的排队状态',
    '店员': '门店实时运营',
    '运维': '设备状态监控',
    '运营经理': '运营总览',
  }

  const baseStats = overview ? [
    { icon: Car, label: '空闲车位/总车位', value: `${overview.bays.idle}/${overview.bays.total}`, color: 'text-emerald-400' },
    { icon: Users, label: '排队中', value: overview.queue.waiting, color: 'text-cyan-400' },
  ] : []

  const staffStats = overview ? [
    ...baseStats,
    { icon: Clock, label: '洗车中', value: overview.bays.occupied, color: 'text-blue-400' },
    { icon: Wrench, label: '故障车位', value: overview.bays.fault, color: 'text-orange-400' },
  ] : []

  const managerStats = overview ? [
    { icon: Car, label: '空闲车位/总车位', value: `${overview.bays.idle}/${overview.bays.total}`, color: 'text-emerald-400' },
    { icon: Users, label: '排队中', value: overview.queue.waiting, color: 'text-cyan-400' },
    { icon: Clock, label: '洗车中', value: overview.bays.occupied, color: 'text-blue-400' },
    { icon: Wrench, label: '故障车位', value: overview.bays.fault, color: 'text-orange-400' },
    { icon: AlertTriangle, label: '超时占用', value: overview.bays.overtime || 0, color: 'text-red-400' },
    { icon: Bell, label: '今日收入', value: `¥${overview.revenue_today_cents ? (overview.revenue_today_cents / 100).toFixed(2) : '0.00'}`, color: 'text-emerald-400' },
  ] : []

  const stats = currentRole === '车主' ? baseStats :
    currentRole === '运营经理' ? managerStats : staffStats

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">{roleTitle[currentRole] || '工作台'}</h2>
        <div className="text-sm text-slate-400">
          当前角色: <span className="text-cyan-400 font-semibold">{currentRole}</span>
        </div>
      </div>

      {notifications.length > 0 && (perms.canManageQueue || currentRole === '运营经理' || currentRole === '运维') && (
        <div className="rounded-lg bg-orange-500/10 border border-orange-500/30 p-3 space-y-1">
          {notifications.map((n, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-orange-300">
              <Bell size={14} /> {n}
            </div>
          ))}
        </div>
      )}

      <div className={`grid gap-4 ${stats.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' : stats.length <= 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'}`}>
        {stats.map((s, i) => (
          <div key={i} className="bg-slate-800 rounded-lg p-4 border border-white/10 shadow">
            <div className="flex items-center gap-2 text-sm text-slate-400 mb-1"><s.icon size={16} />{s.label}</div>
            <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {bays.map(bay => <BayCard key={bay.id} bay={bay} onAction={handleBayAction} canManage={canManage} />)}
      </div>

      {(currentRole !== '车主' || canManage) && (
        <div className="bg-slate-800 rounded-lg border border-white/10 shadow">
          <div className="p-4 border-b border-white/10 font-semibold flex items-center justify-between">
            <span>排队列表</span>
            <span className="text-xs text-slate-400">共 {queue.length} 辆等待</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="px-4 py-3 text-left">序号</th>
                  <th className="px-4 py-3 text-left">车牌</th>
                  <th className="px-4 py-3 text-left">车型</th>
                  <th className="px-4 py-3 text-left">套餐</th>
                  <th className="px-4 py-3 text-left">预计到店</th>
                  <th className="px-4 py-3 text-left">等待时长</th>
                  <th className="px-4 py-3 text-left">状态</th>
                  <th className="px-4 py-3 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {queue.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">暂无排队</td></tr>
                )}
                {queue.map((q, i) => (
                  <tr key={q.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 font-mono">{i + 1}</td>
                    <td className="px-4 py-3 font-mono">{q.plate_number}</td>
                    <td className="px-4 py-3">{q.car_type}</td>
                    <td className="px-4 py-3">{pkgLabels[q.service_package] || q.service_package}</td>
                    <td className="px-4 py-3 font-mono">{q.estimated_arrival_minutes}分钟</td>
                    <td className="px-4 py-3 font-mono">第{q.position}位</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${q.status === 'waiting' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {q.status === 'waiting' ? '等待中' : '已叫号'}
                      </span>
                    </td>
                    <td className="px-4 py-3 space-x-2">
                      {q.status === 'waiting' && perms.canManageQueue && (
                        <button onClick={() => handleQueueAction(q, 'call')} className="text-cyan-400 hover:underline text-xs">叫号</button>
                      )}
                      {perms.canCancelOrder && (
                        <button onClick={() => handleQueueAction(q, 'cancel')} className="text-red-400 hover:underline text-xs">取消</button>
                      )}
                      {!perms.canManageQueue && !perms.canCancelOrder && (
                        <CheckCircle size={14} className="text-slate-600 inline" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {currentRole === '车主' && !canManage && (
        <div className="bg-slate-800 rounded-lg border border-white/10 shadow p-6 text-center">
          <Car size={48} className="mx-auto mb-3 text-cyan-400" />
          <h3 className="text-lg font-bold mb-2">准备洗车？</h3>
          <p className="text-slate-400 mb-4">点击"车主排队"开始登记，选择车型、套餐和到店时间</p>
        </div>
      )}
    </div>
  )
}
