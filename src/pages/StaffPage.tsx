import { useEffect, useState, useCallback } from 'react'
import { fetchBays, fetchOperationLogs, releaseBay, forceCompleteBay, callNext, resolveFault, reportFault, overtimeCharge } from '@/lib/api'
import { Clock, ChevronDown, Wrench, Headset, ShieldCheck } from 'lucide-react'
import FaultModal from '@/components/FaultModal'
import { useAppStore, ROLE_PERMISSIONS } from '@/store/useAppStore'

const statusMap: Record<string, { label: string; color: string; dot: string }> = {
  idle: { label: '空闲', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  occupied: { label: '洗车中', color: 'text-blue-400', dot: 'bg-blue-400' },
  fault: { label: '故障', color: 'text-orange-400', dot: 'bg-orange-400' },
  overtime: { label: '超时', color: 'text-red-400', dot: 'bg-red-400' },
}

const actionColors: Record<string, string> = {
  call_next: 'bg-cyan-500/20 text-cyan-400',
  release_bay: 'bg-blue-500/20 text-blue-400',
  force_complete: 'bg-red-500/20 text-red-400',
  report_fault: 'bg-orange-500/20 text-orange-400',
  resolve_fault: 'bg-emerald-500/20 text-emerald-400',
  overtime_charge: 'bg-yellow-500/20 text-yellow-400',
  join_queue: 'bg-purple-500/20 text-purple-400',
  cancel_order: 'bg-red-500/20 text-red-400',
  auto_cancel_late: 'bg-yellow-600/20 text-yellow-500',
  auto_overtime_charge: 'bg-yellow-500/20 text-yellow-400',
}

const actionLabels: Record<string, string> = {
  call_next: '叫号',
  release_bay: '释放车位',
  force_complete: '强制完成',
  report_fault: '上报故障',
  resolve_fault: '修复故障',
  overtime_charge: '超时加价',
  join_queue: '加入排队',
  cancel_order: '取消订单',
  auto_cancel_late: '迟到自动取消',
  auto_overtime_charge: '系统超时加价',
}

export default function StaffPage() {
  const { currentRole } = useAppStore()
  const perms = ROLE_PERMISSIONS[currentRole]

  const [bays, setBays] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [logOffset, setLogOffset] = useState(0)
  const [faultBay, setFaultBay] = useState<{ id: number; name: string } | null>(null)
  const [overtimeInput, setOvertimeInput] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)

  const operatorName = currentRole === '运维' ? 'maintenance' : 'staff'
  const operatorRole = currentRole === '运维' ? 'maintenance' : 'staff'

  const refresh = useCallback(async () => {
    try {
      const [b, l] = await Promise.all([fetchBays(), fetchOperationLogs(20, 0)])
      setBays(b)
      setLogs(l)
      setLogOffset(0)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  const loadMoreLogs = async () => {
    const newOffset = logOffset + 20
    const more = await fetchOperationLogs(20, newOffset)
    setLogs(prev => [...prev, ...more])
    setLogOffset(newOffset)
  }

  const handleBayAction = async (bay: any, action: string) => {
    try {
      if (action === 'complete') {
        if (!perms.canReleaseBay) { alert('无权限'); return }
        await releaseBay(bay.id, operatorName)
      }
      else if (action === 'force') {
        if (!perms.canReleaseBay) { alert('无权限'); return }
        await forceCompleteBay(bay.id, operatorName)
      }
      else if (action === 'resolve') {
        if (!perms.canResolveFault) { alert('无权限，仅运维可确认修复'); return }
        await resolveFault(bay.id, operatorName)
      }
      else if (action === 'overtime') {
        if (!perms.canOvertimeCharge) { alert('无权限'); return }
        const amt = Number(overtimeInput[bay.id] || 0)
        if (amt <= 0) { alert('请输入超时加价金额'); return }
        if (bay.current_order_id) await overtimeCharge(Number(bay.current_order_id), amt, operatorName)
      }
      setOvertimeInput(prev => { const n = { ...prev }; delete n[bay.id]; return n })
      refresh()
    } catch (e: any) { alert(e.message) }
  }

  const handleCallNext = async () => {
    if (!perms.canManageQueue) { alert('无权限'); return }
    try {
      const res: any = await callNext()
      if (res?.paymentRequired) {
        alert(res.message || '该订单尚未支付，请先完成付款')
      } else if (res?.message) {
        alert(res.message)
      }
      refresh()
    }
    catch (e: any) { alert(e.message) }
  }

  const handleReportFault = () => {
    if (!perms.canMarkFault) { alert('无权限'); return }
  }

  const handleFaultSubmit = async (data: any) => {
    try {
      await reportFault({ ...data, reported_by: operatorRole })
      setFaultBay(null)
      refresh()
    } catch (e: any) { alert(e.message) }
  }

  if (loading) return <div className="flex items-center justify-center h-96 text-slate-400">加载中...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">
          {currentRole === '运维' ? (
            <span className="flex items-center gap-2"><Wrench size={20} className="text-orange-400" /> 运维调度台</span>
          ) : (
            <span className="flex items-center gap-2"><Headset size={20} className="text-cyan-400" /> 店员调度台</span>
          )}
        </h2>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <ShieldCheck size={14} className="text-cyan-400" />
          <span>{currentRole}权限视图</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-[60%] space-y-4">
          {bays.map(bay => {
            const s = statusMap[bay.status] || statusMap.idle
            return (
              <div key={bay.id} className="bg-slate-800 rounded-lg p-5 border border-white/10 shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${s.dot} ${bay.status === 'fault' || bay.status === 'overtime' ? 'animate-pulse' : ''}`} />
                    <span className="text-lg font-bold">{bay.name || `车位${bay.id}`}</span>
                    <span className={`text-sm ${s.color}`}>{s.label}</span>
                  </div>
                  {perms.canMarkFault ? (
                    <button onClick={() => { handleReportFault(); setFaultBay({ id: bay.id, name: bay.name || `车位${bay.id}` }) }}
                      className="text-xs px-2 py-1 rounded bg-orange-500/10 text-orange-400 hover:bg-orange-500/20">标记故障</button>
                  ) : bay.status === 'fault' ? (
                    <span className="text-xs px-2 py-1 rounded bg-orange-500/10 text-orange-400">维修中</span>
                  ) : null}
                </div>
                {(bay.status === 'occupied' || bay.status === 'overtime') && (
                  <div className="text-sm text-slate-300 mb-3 space-y-1">
                    <div>车牌: <span className="font-mono">{bay.plate_number || '—'}</span></div>
                    <div className="flex items-center gap-1"><Clock size={12} /> 开始于 {bay.started_at || bay.updated_at}</div>
                    {bay.overtime_amount > 0 && (
                      <div className="text-yellow-400 font-semibold">超时费用: ¥{bay.overtime_amount}</div>
                    )}
                  </div>
                )}
                {bay.status === 'fault' && bay.fault_description && (
                  <div className="text-sm text-orange-300 mb-3 bg-orange-500/5 rounded p-2">
                    故障描述: {bay.fault_description}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {bay.status === 'idle' && perms.canManageQueue && (
                    <button onClick={handleCallNext}
                      className="px-4 py-1.5 rounded text-sm bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30">分配车辆</button>
                  )}
                  {bay.status === 'occupied' && (
                    <>
                      {perms.canReleaseBay && (
                        <button onClick={() => handleBayAction(bay, 'complete')}
                          className="px-4 py-1.5 rounded text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30">完成洗车</button>
                      )}
                      {perms.canOvertimeCharge && (
                        <div className="flex items-center gap-1">
                          <input type="number" placeholder="超时加价" value={overtimeInput[bay.id] || ''}
                            onChange={e => setOvertimeInput(p => ({ ...p, [bay.id]: e.target.value }))}
                            className="w-24 bg-slate-900 border border-white/10 rounded px-2 py-1 text-sm font-mono" />
                          <button onClick={() => handleBayAction(bay, 'overtime')}
                            className="px-3 py-1.5 rounded text-sm bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30">加价</button>
                        </div>
                      )}
                    </>
                  )}
                  {bay.status === 'fault' && perms.canResolveFault && (
                    <button onClick={() => handleBayAction(bay, 'resolve')}
                      className="px-4 py-1.5 rounded text-sm bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30">修复完成</button>
                  )}
                  {bay.status === 'overtime' && (
                    <>
                      {perms.canReleaseBay && (
                        <button onClick={() => handleBayAction(bay, 'force')}
                          className="px-4 py-1.5 rounded text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30">强制完成</button>
                      )}
                      {perms.canOvertimeCharge && (
                        <div className="flex items-center gap-1">
                          <input type="number" placeholder="超时加价" value={overtimeInput[bay.id] || ''}
                            onChange={e => setOvertimeInput(p => ({ ...p, [bay.id]: e.target.value }))}
                            className="w-24 bg-slate-900 border border-white/10 rounded px-2 py-1 text-sm font-mono" />
                          <button onClick={() => handleBayAction(bay, 'overtime')}
                            className="px-3 py-1.5 rounded text-sm bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30">加价</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="lg:w-[40%]">
          <div className="bg-slate-800 rounded-lg border border-white/10 shadow">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <span className="font-semibold">操作日志</span>
              <span className="text-xs text-slate-400">最近 {logs.length} 条</span>
            </div>
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              {logs.length === 0 && (
                <div className="text-center text-slate-500 py-8 text-sm">暂无操作记录</div>
              )}
              {logs.map((log, i) => (
                <div key={log.id || i} className="flex gap-3 text-sm">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                      {(log.operator_name || '?')[0].toUpperCase()}
                    </div>
                    {i < logs.length - 1 && <div className="w-px flex-1 bg-white/10 mt-1" />}
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-slate-400 text-xs font-mono">{log.created_at?.slice(11, 19) || ''}</span>
                      <span className="text-slate-500 text-xs">{log.operator_role || ''}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs ${actionColors[log.action] || 'bg-slate-600/30 text-slate-300'}`}>
                        {actionLabels[log.action] || log.action}
                      </span>
                    </div>
                    <div className="text-slate-300">{log.details || '—'}</div>
                  </div>
                </div>
              ))}
              {logs.length >= 20 && (
                <button onClick={loadMoreLogs}
                  className="w-full py-2 text-sm text-slate-400 hover:text-slate-300 flex items-center justify-center gap-1">
                  <ChevronDown size={14} /> 加载更多
                </button>
              )}
            </div>
          </div>
        </div>

        {faultBay && (
          <FaultModal bayId={faultBay.id} bayName={faultBay.name} onClose={() => setFaultBay(null)} onSubmit={handleFaultSubmit} />
        )}
      </div>
    </div>
  )
}
