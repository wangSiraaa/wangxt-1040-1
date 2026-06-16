import { useEffect, useState, useCallback } from 'react'
import { fetchOverview, fetchRevenueStats, fetchOvertimeStats, fetchFaultLossStats, fetchCancellationStats } from '@/lib/api'
import { DollarSign, Users, Car, Wrench, TrendingUp, TrendingDown, ShieldCheck, BarChart2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { useAppStore, ROLE_PERMISSIONS } from '@/store/useAppStore'

const PIE_COLORS = ['#06D6A0', '#3B82F6', '#F59E0B', '#EF4444']

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

export default function OperationsPage() {
  const { currentRole } = useAppStore()
  const perms = ROLE_PERMISSIONS[currentRole]
  const [overview, setOverview] = useState<any>(null)
  const [revenue, setRevenue] = useState<any>(null)
  const [overtime, setOvertime] = useState<any>(null)
  const [faultLoss, setFaultLoss] = useState<any>(null)
  const [cancellation, setCancellation] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [o, r, ot, fl, c] = await Promise.all([
        fetchOverview(), fetchRevenueStats(), fetchOvertimeStats(),
        fetchFaultLossStats(), fetchCancellationStats(),
      ])
      setOverview(o); setRevenue(r); setOvertime(ot); setFaultLoss(fl); setCancellation(c)
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
  const otByBayData = overtime?.byBay?.map((b: any) => ({ name: `车位${b.bay_id}`, count: b.cnt, revenue: b.total })) || []

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="今日收入" value={`¥${overview?.revenue?.today ?? 0}`} color="text-cyan-400" />
        <StatCard icon={Users} label="排队总数" value={overview?.orders?.queued ?? 0} color="text-blue-400" />
        <StatCard icon={Car} label="洗车完成" value={overview?.orders?.completed ?? 0} color="text-emerald-400" />
        <StatCard icon={Wrench} label="故障次数" value={faultLoss?.faultCount ?? 0} color="text-orange-400" />
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
                <th className="px-4 py-2 text-left">故障设备</th>
                <th className="px-4 py-2 text-left">故障类型</th>
                <th className="px-4 py-2 text-left">持续时长</th>
                <th className="px-4 py-2 text-right">估算损失</th>
              </tr>
            </thead>
            <tbody>
              {faultTableData.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-slate-500">暂无故障数据</td></tr>
              )}
              {faultTableData.map((r: any, i: number) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="px-4 py-2">{r.type}</td>
                  <td className="px-4 py-2">{r.type}</td>
                  <td className="px-4 py-2 font-mono">{faultLoss?.avgDurationMinutes ?? 0}分钟</td>
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
    </div>
  )
}
