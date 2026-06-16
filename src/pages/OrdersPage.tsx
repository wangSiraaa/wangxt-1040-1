import { useEffect, useState, useCallback } from 'react'
import { fetchOrders, fetchOrder, changePackage, cancelOrder, payOrder, overtimeCharge, forceCompleteBay } from '@/lib/api'
import { X, ShieldCheck, ClipboardList } from 'lucide-react'
import { useAppStore, ROLE_PERMISSIONS } from '@/store/useAppStore'

const TABS = [
  { key: '', label: '全部' },
  { key: 'queued', label: '排队中' },
  { key: 'washing', label: '洗车中' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
]

const statusStyles: Record<string, string> = {
  queued: 'bg-yellow-500/20 text-yellow-400', washing: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-emerald-500/20 text-emerald-400', cancelled: 'bg-red-500/20 text-red-400',
}
const statusLabels: Record<string, string> = { queued: '排队中', washing: '洗车中', completed: '已完成', cancelled: '已取消' }
const payLabels: Record<string, string> = { paid: '已支付', unpaid: '未支付', refunded: '已退款' }
const payStyles: Record<string, string> = { paid: 'text-emerald-400', unpaid: 'text-red-400', refunded: 'text-yellow-400' }
const pkgLabels: Record<string, string> = { standard: '标准洗', premium: '精洗', interior: '内饰+外观', full: '全套' }
const PKG_OPTIONS = ['standard', 'premium', 'interior', 'full']
const PKG_PRICES: Record<string, number> = { standard: 25, premium: 45, interior: 55, full: 78 }

export default function OrdersPage() {
  const { currentRole } = useAppStore()
  const perms = ROLE_PERMISSIONS[currentRole]

  const [tab, setTab] = useState('')
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [detailOrder, setDetailOrder] = useState<any>(null)
  const [changePkgOrder, setChangePkgOrder] = useState<any>(null)
  const [newPkg, setNewPkg] = useState('')
  const [overtimeOrderId, setOvertimeOrderId] = useState<number | null>(null)
  const [overtimeAmt, setOvertimeAmt] = useState('')

  const operatorName = currentRole === '运营经理' ? 'manager' : 'admin'

  const refresh = useCallback(async () => {
    try { setOrders(await fetchOrders(tab || undefined)) } catch {}
    setLoading(false)
  }, [tab])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 10000)
    return () => clearInterval(id)
  }, [refresh])

  const handleAction = async (order: any, action: string) => {
    try {
      if (action === 'pay') {
        if (!perms.canManageOrders) { alert('无权限'); return }
        await payOrder(order.id)
      }
      else if (action === 'cancel') {
        if (!perms.canCancelOrder) { alert('无权限'); return }
        await cancelOrder(order.id, `${currentRole}取消`, operatorName)
      }
      else if (action === 'forceComplete') {
        if (!perms.canReleaseBay) { alert('无权限'); return }
        if (order.bay_id) await forceCompleteBay(order.bay_id, operatorName)
      }
      else if (action === 'detail') { setDetailOrder(await fetchOrder(order.id)); return }
      refresh()
    } catch (e: any) { alert(e.message) }
  }

  const handleChangePkg = async () => {
    if (!perms.canChangePackage) { alert('无权限'); return }
    if (!changePkgOrder || !newPkg) return
    try { await changePackage(changePkgOrder.id, newPkg, operatorName); setChangePkgOrder(null); setNewPkg(''); refresh() }
    catch (e: any) { alert(e.message) }
  }

  const handleOvertimeCharge = async () => {
    if (!perms.canOvertimeCharge) { alert('无权限'); return }
    if (!overtimeOrderId || !overtimeAmt) return
    try { await overtimeCharge(overtimeOrderId, Number(overtimeAmt), operatorName); setOvertimeOrderId(null); setOvertimeAmt(''); refresh() }
    catch (e: any) { alert(e.message) }
  }

  if (loading) return <div className="flex items-center justify-center h-96 text-slate-400">加载中...</div>

  if (!perms.canManageOrders) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-400">
        <ShieldCheck size={48} className="mb-3 text-orange-400" />
        <h3 className="text-lg font-bold mb-2 text-slate-300">无权限访问</h3>
        <p className="text-sm">当前角色「{currentRole}」没有订单管理权限</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <ClipboardList size={20} className="text-cyan-400" />
          订单管理
        </h2>
        <div className="text-sm text-slate-400">
          <ShieldCheck size={12} className="inline mr-1 text-cyan-400" />
          {currentRole}视图 · 共 {orders.length} 条
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${tab === t.key ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-400 hover:bg-white/5'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-slate-800 rounded-lg border border-white/10 shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-white/10">
              <th className="px-4 py-3 text-left">订单号</th>
              <th className="px-4 py-3 text-left">车牌</th>
              <th className="px-4 py-3 text-left">车型</th>
              <th className="px-4 py-3 text-left">套餐</th>
              <th className="px-4 py-3 text-right">金额</th>
              <th className="px-4 py-3 text-left">支付状态</th>
              <th className="px-4 py-3 text-left">订单状态</th>
              <th className="px-4 py-3 text-left">创建时间</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">暂无订单</td></tr>}
            {orders.map(o => (
              <tr key={o.id} className={`border-b border-white/5 hover:bg-white/5 ${o.status === 'cancelled' ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3 font-mono text-xs">#{o.id}</td>
                <td className="px-4 py-3 font-mono">{o.plate_number}</td>
                <td className="px-4 py-3">{o.car_type}</td>
                <td className="px-4 py-3">{pkgLabels[o.service_package] || o.service_package}</td>
                <td className="px-4 py-3 text-right font-mono">¥{o.total_amount}</td>
                <td className="px-4 py-3"><span className={payStyles[o.payment_status] || ''}>{payLabels[o.payment_status] || o.payment_status}</span></td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs ${statusStyles[o.status] || ''}`}>{statusLabels[o.status] || o.status}</span></td>
                <td className="px-4 py-3 text-xs text-slate-400 font-mono">{o.created_at?.slice(5, 16)}</td>
                <td className="px-4 py-3 space-x-1">
                  {o.status === 'queued' && (
                    <>
                      <button onClick={() => handleAction(o, 'pay')} className="text-cyan-400 hover:underline text-xs">支付</button>
                      {perms.canChangePackage && (
                        <button onClick={() => { setChangePkgOrder(o); setNewPkg('') }} className="text-blue-400 hover:underline text-xs">改套餐</button>
                      )}
                      {perms.canCancelOrder && (
                        <button onClick={() => handleAction(o, 'cancel')} className="text-red-400 hover:underline text-xs">取消</button>
                      )}
                    </>
                  )}
                  {o.status === 'washing' && (
                    <>
                      {perms.canOvertimeCharge && (
                        <button onClick={() => { setOvertimeOrderId(o.id); setOvertimeAmt('') }} className="text-yellow-400 hover:underline text-xs">超时加价</button>
                      )}
                      {perms.canReleaseBay && (
                        <button onClick={() => handleAction(o, 'forceComplete')} className="text-red-400 hover:underline text-xs">强制完成</button>
                      )}
                    </>
                  )}
                  {(o.status === 'completed' || o.status === 'cancelled') && (
                    <button onClick={() => handleAction(o, 'detail')} className="text-slate-400 hover:underline text-xs">详情</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detailOrder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-white/10 shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <span className="font-semibold">订单详情 #{detailOrder.id}</span>
              <button onClick={() => setDetailOrder(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">车牌</span><span className="font-mono">{detailOrder.plate_number}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">车型</span><span>{detailOrder.car_type}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">套餐</span><span>{pkgLabels[detailOrder.service_package] || detailOrder.service_package}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">基础金额</span><span className="font-mono">¥{detailOrder.base_amount}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">超时金额</span><span className="font-mono text-yellow-400">¥{detailOrder.overtime_amount}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">总金额</span><span className="font-mono font-bold text-cyan-400">¥{detailOrder.total_amount}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">支付状态</span><span className={payStyles[detailOrder.payment_status]}>{payLabels[detailOrder.payment_status]}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">订单状态</span><span>{statusLabels[detailOrder.status]}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">创建时间</span><span className="font-mono text-xs">{detailOrder.created_at}</span></div>
              {detailOrder.cancelled_at && (
                <div className="flex justify-between"><span className="text-slate-400">取消时间</span><span className="font-mono text-xs text-red-400">{detailOrder.cancelled_at}</span></div>
              )}
              {detailOrder.cancel_reason && (
                <div className="flex justify-between"><span className="text-slate-400">取消原因</span><span className="text-xs text-red-400">{detailOrder.cancel_reason}</span></div>
              )}
              {detailOrder.billings?.length > 0 && (
                <div className="border-t border-white/10 pt-3 mt-3">
                  <div className="font-semibold mb-2">账单记录</div>
                  {detailOrder.billings.map((b: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs py-1">
                      <span className="text-slate-400">{b.description || b.billing_type}</span>
                      <span className={`font-mono ${Number(b.amount) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {Number(b.amount) >= 0 ? '+' : ''}¥{b.amount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {changePkgOrder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-white/10 shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <span className="font-semibold">修改套餐</span>
              <button onClick={() => setChangePkgOrder(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-sm text-slate-400">当前套餐: <span className="text-white">{pkgLabels[changePkgOrder.service_package]}</span></div>
              <select value={newPkg} onChange={e => setNewPkg(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm">
                <option value="">选择新套餐</option>
                {PKG_OPTIONS.filter(p => p !== changePkgOrder.service_package).map(p => (
                  <option key={p} value={p}>{pkgLabels[p]} ¥{PKG_PRICES[p]}</option>
                ))}
              </select>
              {newPkg && (
                <div className="text-sm">
                  价差:
                  <span className={`font-mono ml-1 ${PKG_PRICES[newPkg] - Number(changePkgOrder.base_amount) >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>
                    {PKG_PRICES[newPkg] - Number(changePkgOrder.base_amount) >= 0 ? '+' : ''}¥{PKG_PRICES[newPkg] - Number(changePkgOrder.base_amount)}
                  </span>
                </div>
              )}
              <button onClick={handleChangePkg} disabled={!newPkg}
                className="w-full py-2 rounded-lg bg-cyan-500/20 text-cyan-400 font-semibold hover:bg-cyan-500/30 disabled:opacity-30">确认修改</button>
            </div>
          </div>
        </div>
      )}

      {overtimeOrderId !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-white/10 shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <span className="font-semibold">超时加价</span>
              <button onClick={() => setOvertimeOrderId(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-sm text-slate-400">
                每5分钟加收¥5，上限¥30。可手动追加任意金额。
              </div>
              <input type="number" value={overtimeAmt} onChange={e => setOvertimeAmt(e.target.value)} placeholder="输入加价金额"
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono" />
              <button onClick={handleOvertimeCharge} disabled={!overtimeAmt}
                className="w-full py-2 rounded-lg bg-yellow-500/20 text-yellow-400 font-semibold hover:bg-yellow-500/30 disabled:opacity-30">确认加价</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
