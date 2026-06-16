import { useEffect, useState, useCallback } from 'react'
import {
  fetchOverview, fetchRevenueStats, fetchOvertimeStats, fetchFaultLossStats,
  fetchCancellationStats, fetchReservationStats, fetchFaultTransferStats,
  fetchMonthlyCardStats, fetchQueueTimeline,
} from '@/lib/api'
import {
  DollarSign, Users, Car, Wrench, TrendingUp, TrendingDown, ShieldCheck,
  BarChart2, Clock, Calendar, CreditCard, AlertTriangle, ArrowRightLeft,
  XCircle, CheckCircle, AlertCircle, CalendarClock, Ticket,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart,
  Pie, Cell, Legend,
} from 'recharts'
import { useAppStore, ROLE_PERMISSIONS } from '@/store/useAppStore'

const PIE_COLORS = ['#06D6A0', '#3B82F6', '#F59E0B', '#EF4444']

const EVENT_COLORS: Record<string, { bg: string; icon: any; label: string }> = {
  queue_join: { bg: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Users, label: '排队加入' },
  queue_call: { bg: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', icon: Clock, label: '叫号' },
  queue_leave: { bg: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: XCircle, label: '离开队列' },
  order_create: { bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: Car, label: '订单创建' },
  order_start: { bg: 'bg-green-500/20 text-green-400 border-green-500/30', icon: CheckCircle, label: '开始洗车' },
  order_complete: { bg: 'bg-emerald-600/20 text-emerald-500 border-emerald-600/30', icon: CheckCircle, label: '完成洗车' },
  order_cancel: { bg: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle, label: '订单取消' },
  order_transfer: { bg: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: ArrowRightLeft, label: '订单转移' },
  reservation_create: { bg: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30', icon: Calendar, label: '创建预约' },
  reservation_checkin: { bg: 'bg-teal-500/20 text-teal-400 border-teal-500/30', icon: CalendarClock, label: '预约签到' },
  reservation_no_show: { bg: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: AlertTriangle, label: '预约爽约' },
  reservation_cancel: { bg: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: XCircle, label: '预约取消' },
  reservation_skip: { bg: 'bg-violet-500/20 text-violet-400 border-violet-500/30', icon: Ticket, label: 'VIP免排' },
  reservation_expire: { bg: 'bg-red-500/20 text-red-400 border-red-500/30', icon: AlertCircle, label: '预约过期' },
  fault_report: { bg: 'bg-red-500/20 text-red-400 border-red-500/30', icon: AlertTriangle, label: '故障报告' },
  fault_resolve: { bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: Wrench, label: '故障解决' },
  fault_transfer: { bg: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: ArrowRightLeft, label: '故障转移' },
  fault_manual_confirm: { bg: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: ShieldCheck, label: '人工确认' },
  bay_occupy: { bg: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Car, label: '车位占用' },
  bay_release: { bg: 'bg-green-500/20 text-green-400 border-green-500/30', icon: CheckCircle, label: '车位释放' },
  bay_fault: { bg: 'bg-red-500/20 text-red-400 border-red-500/30', icon: AlertTriangle, label: '车位故障' },
  monthly_card_create: { bg: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30', icon: CreditCard, label: '月卡创建' },
  monthly_card_expire: { bg: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: AlertCircle, label: '月卡过期' },
  reservation_batch_expire: { bg: 'bg-red-500/20 text-red-400 border-red-500/30', icon: Clock, label: '批量预约过期' },
  monthly_card_batch_expire: { bg: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: Clock, label: '批量月卡过期' },
}

function StatCard({ icon: Icon, label, value, trend, color }: any) {
  return (
    <div className="bg-slate-800 rounded-lg p-5 border border-white/10 shadow">
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-2"><Icon size={16} />{label}</div>
      <div className={`text-3xl font-bold font-mono ${color || 'text-white'}`}>{value}</div>
      {trend !== undefined && (
        <div className={`flex items-center gap-1 text-xs mt-1 ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {trend >= 0 ? '+' : ''}{trend}%
        </div>
      )}
    </div>
  )
}

function TimelineEvent({ event }: { event: any }) {
  const eventStyle = EVENT_COLORS[event.event_type] || EVENT_COLORS.queue_join
  const Icon = eventStyle.icon
  const time = event.event_time ? new Date(event.event_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center border ${eventStyle.bg}`}>
          <Icon size={16} />
        </div>
        <div className="w-px flex-1 bg-white/10 mt-1" />
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${eventStyle.bg}`}>{eventStyle.label}</span>
          <span className="text-xs text-slate-500 font-mono">{time}</span>
          {event.operator_name && (
            <span className="text-xs text-slate-400">· {event.operator_name}</span>
          )}
        </div>
        <div className="text-sm text-slate-200">{event.details}</div>
        <div className="flex flex-wrap gap-2 mt-1">
          {event.bay_id && <span className="text-xs text-slate-400">车位#{event.bay_id}</span>}
          {event.order_id && <span className="text-xs text-slate-400">订单#{event.order_id}</span>}
          {event.reservation_id && <span className="text-xs text-slate-400">预约#{event.reservation_id}</span>}
          {event.fault_id && <span className="text-xs text-slate-400">故障#{event.fault_id}</span>}
          {event.transfer_id && <span className="text-xs text-slate-400">转移#{event.transfer_id}</span>}
        </div>
      </div>
    </div>
  )
}

export default function OperationsPage() {
  const { currentRole } = useAppStore()
  const perms = ROLE_PERMISSIONS[currentRole]
  const [overview, setOverview] = useState<any>(null)
  const [revenue, setRevenue] = useState<any>(null)
  const [overtime, setOvertime] = useState<any>(null)
  const [faultLoss, setFaultLoss] = useState<any>(null)
  const [cancellation, setCancellation] = useState<any>(null)
  const [reservationStats, setReservationStats] = useState<any>(null)
  const [faultTransferStats, setFaultTransferStats] = useState<any>(null)
  const [monthlyCardStats, setMonthlyCardStats] = useState<any>(null)
  const [timeline, setTimeline] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [o, r, ot, fl, c, rs, fts, mcs, tl] = await Promise.all([
        fetchOverview(),
        fetchRevenueStats(),
        fetchOvertimeStats(),
        fetchFaultLossStats(),
        fetchCancellationStats(),
        fetchReservationStats().catch(() => null),
        fetchFaultTransferStats().catch(() => null),
        fetchMonthlyCardStats().catch(() => null),
        fetchQueueTimeline(30).catch(() => []),
      ])
      setOverview(o)
      setRevenue(r)
      setOvertime(ot)
      setFaultLoss(fl)
      setCancellation(c)
      setReservationStats(rs)
      setFaultTransferStats(fts)
      setMonthlyCardStats(mcs)
      setTimeline(tl || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30000)
    return () => clearInterval(id)
  }, [refresh])

  if (loading) return <div className="flex items-center justify-center h-96 text-slate-400">加载中...</div>

  if (!perms.canViewOperations) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-400">
        <ShieldCheck size={48} className="mb-3 text-orange-400" />
        <h3 className="text-lg font-bold mb-2 text-slate-300">无权限访问</h3>
        <p className="text-sm">当前角色「{currentRole}」没有运营看板权限</p>
      </div>
    )
  }

  const pkgChartData = revenue?.byPackage
    ? Object.entries(revenue.byPackage).map(([k, v]) => ({ name: k, value: v }))
    : []
  const payChartData = revenue?.byPaymentMethod
    ? Object.entries(revenue.byPaymentMethod).map(([k, v]) => ({ name: k, value: v }))
    : []
  const otByBayData = overtime?.byBay?.map((b: any) => ({
    name: `车位${b.bay_id}`, count: b.cnt, revenue: b.total,
  })) || []

  const faultTableData = faultLoss?.byType?.map((t: any) => ({
    type: t.fault_type, count: t.cnt, loss: ((t.total_loss || 0) / 100).toFixed(2),
  })) || []

  const cancelReasonData = cancellation?.reasonsDistribution?.map((r: any) => ({
    name: r.cancel_reason || '未填写', count: r.cnt,
  })) || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <BarChart2 size={20} className="text-cyan-400" /> 运营数据看板
        </h2>
        <div className="text-sm text-slate-400 flex items-center gap-1">
          <ShieldCheck size={12} /> 运营经理视图
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard icon={DollarSign} label="今日收入" value={`¥${overview?.revenue?.today ?? 0}`} color="text-cyan-400" />
        <StatCard icon={Users} label="排队总数" value={overview?.orders?.queued ?? 0} color="text-blue-400" />
        <StatCard icon={Car} label="洗车完成" value={overview?.orders?.completed ?? 0} color="text-emerald-400" />
        <StatCard icon={Wrench} label="故障次数" value={faultLoss?.faultCount ?? 0} color="text-orange-400" />
        <StatCard icon={Calendar} label="活跃预约" value={overview?.reservations?.active ?? 0} color="text-indigo-400" />
        <StatCard icon={CreditCard} label="活跃月卡" value={overview?.monthlyCards?.active ?? 0} color="text-violet-400" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 rounded-lg p-5 border border-white/10 shadow">
          <div className="flex items-center gap-2 text-orange-400 text-sm font-semibold mb-3">
            <AlertTriangle size={16} /> 爽约与预约
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-400">爽约次数</div>
              <div className="font-mono text-xl font-bold text-orange-400">{reservationStats?.noShowCount ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">爽约费率</div>
              <div className="font-mono text-xl font-bold text-orange-400">{reservationStats?.noShowRate ?? 0}%</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">爽约收入</div>
              <div className="font-mono text-xl font-bold text-yellow-400">¥{((reservationStats?.totalNoShowFeeCents ?? 0) / 100).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">VIP免排</div>
              <div className="font-mono text-xl font-bold text-violet-400">{reservationStats?.vipSkipCount ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">预约利用率</div>
              <div className="font-mono text-xl font-bold text-cyan-400">{reservationStats?.utilizationRate ?? 0}%</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">预约总数</div>
              <div className="font-mono text-xl font-bold text-slate-200">{reservationStats?.totalReservations ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-5 border border-white/10 shadow">
          <div className="flex items-center gap-2 text-red-400 text-sm font-semibold mb-3">
            <ArrowRightLeft size={16} /> 故障转移损失
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-400">转移次数</div>
              <div className="font-mono text-xl font-bold text-red-400">{faultTransferStats?.totalTransfers ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">待处理</div>
              <div className="font-mono text-xl font-bold text-yellow-400">
                {(faultTransferStats?.pendingTransfers ?? 0) + (faultTransferStats?.awaitingTransfers ?? 0)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">退款总额</div>
              <div className="font-mono text-xl font-bold text-red-400">¥{((faultTransferStats?.totalRefundCents ?? 0) / 100).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">实际损失</div>
              <div className="font-mono text-xl font-bold text-red-500">¥{((faultTransferStats?.totalActualLossCents ?? 0) / 100).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">预估损失</div>
              <div className="font-mono text-xl font-bold text-orange-400">¥{((faultTransferStats?.totalEstimatedLossCents ?? 0) / 100).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">损失超支</div>
              <div className={`font-mono text-xl font-bold ${faultTransferStats?.lossGapCents > 0 ? 'text-red-500' : 'text-emerald-400'}`}>
                ¥{((faultTransferStats?.lossGapCents ?? 0) / 100).toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-5 border border-white/10 shadow">
          <div className="flex items-center gap-2 text-indigo-400 text-sm font-semibold mb-3">
            <CreditCard size={16} /> 月卡运营
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-400">月卡总数</div>
              <div className="font-mono text-xl font-bold text-indigo-400">{monthlyCardStats?.totalCards ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">活跃月卡</div>
              <div className="font-mono text-xl font-bold text-emerald-400">{monthlyCardStats?.activeCards ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">已用洗车</div>
              <div className="font-mono text-xl font-bold text-cyan-400">{monthlyCardStats?.totalUsedWashes ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">已用预约</div>
              <div className="font-mono text-xl font-bold text-violet-400">{monthlyCardStats?.totalUsedReservations ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">已过期</div>
              <div className="font-mono text-xl font-bold text-slate-400">{monthlyCardStats?.expiredCards ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">已冻结</div>
              <div className="font-mono text-xl font-bold text-orange-400">{monthlyCardStats?.frozenCards ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-[60%] space-y-6">
          <div className="bg-slate-800 rounded-lg p-5 border border-white/10 shadow">
            <div className="font-semibold mb-4">收入按套餐</div>
            {pkgChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={pkgChartData}>
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                  <Bar dataKey="value" fill="#06D6A0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="text-center text-slate-500 py-8">暂无数据</div>}
          </div>
          <div className="bg-slate-800 rounded-lg p-5 border border-white/10 shadow">
            <div className="font-semibold mb-4">支付方式分布</div>
            {payChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={payChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {payChartData.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Legend />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="text-center text-slate-500 py-8">暂无数据</div>}
          </div>
        </div>

        <div className="lg:w-[40%] space-y-6">
          <div className="bg-slate-800 rounded-lg p-5 border border-white/10 shadow">
            <div className="font-semibold mb-3">超时统计</div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div><div className="text-xs text-slate-400">超时次数</div><div className="font-mono text-xl font-bold text-red-400">{overtime?.overtimeCount ?? 0}</div></div>
              <div><div className="text-xs text-slate-400">超时加价</div><div className="font-mono text-xl font-bold text-yellow-400">¥{overtime?.totalOvertimeRevenue ?? 0}</div></div>
              <div><div className="text-xs text-slate-400">活跃故障</div><div className="font-mono text-xl font-bold text-orange-400">{faultLoss?.activeCount ?? 0}</div></div>
            </div>
            {otByBayData.length > 0 && (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={otByBayData}>
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-slate-800 rounded-lg p-5 border border-white/10 shadow">
            <div className="font-semibold mb-3">取消统计</div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div><div className="text-xs text-slate-400">取消次数</div><div className="font-mono text-xl font-bold text-red-400">{cancellation?.cancelCount ?? 0}</div></div>
              <div><div className="text-xs text-slate-400">退款总额</div><div className="font-mono text-xl font-bold text-yellow-400">¥{cancellation?.refundTotal ?? 0}</div></div>
            </div>
            {cancelReasonData.length > 0 && (
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={cancelReasonData} layout="vertical">
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 11 }} width={80} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#F59E0B" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-lg p-5 border border-white/10 shadow">
        <div className="font-semibold mb-3">故障损失明细</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="px-4 py-2 text-left">故障类型</th>
                <th className="px-4 py-2 text-left">次数</th>
                <th className="px-4 py-2 text-right">估算损失</th>
              </tr>
            </thead>
            <tbody>
              {faultTableData.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-4 text-center text-slate-500">暂无故障数据</td></tr>
              )}
              {faultTableData.map((r: any, i: number) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="px-4 py-2">{r.type}</td>
                  <td className="px-4 py-2">{r.count}</td>
                  <td className="px-4 py-2 text-right font-mono text-orange-400">¥{r.loss}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {faultLoss?.totalLossCents > 0 && (
          <div className="mt-3 text-right">
            总损失: <span className="font-mono text-lg font-bold text-red-400">¥{(faultLoss.totalLossCents / 100).toFixed(2)}</span>
          </div>
        )}
      </div>

      <div className="bg-slate-800 rounded-lg p-5 border border-white/10 shadow">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold flex items-center gap-2">
            <Clock size={16} className="text-cyan-400" /> 排队时间线
          </div>
          <button
            onClick={refresh}
            className="text-xs text-slate-400 hover:text-slate-200 transition"
          >
            刷新
          </button>
        </div>
        <div className="max-h-[600px] overflow-y-auto pr-2 space-y-1">
          {timeline.length === 0 ? (
            <div className="text-center text-slate-500 py-12">暂无时间线事件</div>
          ) : (
            timeline.map((event, i) => (
              <TimelineEvent key={event.id ?? i} event={event} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
