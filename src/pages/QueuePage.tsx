import { useState } from 'react'
import { checkEligibility, joinQueue } from '@/lib/api'
import { Car, Truck, Bus, TruckIcon, CheckCircle, XCircle, Star, AlertTriangle, User, ShieldCheck } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'

const LATE_THRESHOLD_MINUTES_DEFAULT = 10

const CAR_TYPES = [
  { key: 'sedan', label: '轿车', icon: Car },
  { key: 'suv', label: 'SUV', icon: Truck },
  { key: 'mpv', label: 'MPV', icon: Bus },
  { key: 'van', label: '微面', icon: TruckIcon },
]

const PACKAGES = [
  { key: 'standard', label: '标准洗', price: 25 },
  { key: 'premium', label: '精洗', price: 45, recommended: true },
  { key: 'interior', label: '内饰+外观', price: 55 },
  { key: 'full', label: '全套', price: 78 },
]

const SURCHARGE: Record<string, number> = { sedan: 0, suv: 10, mpv: 15, van: 20 }
const ARRIVAL_OPTIONS = [10, 20, 30, 45, 60]
const PAYMENT_OPTIONS = [
  { key: 'online', label: '线上支付' },
  { key: 'onsite', label: '到店支付', warning: '到店支付需在洗车前完成付款' },
  { key: 'member', label: '会员卡' },
]

export default function QueuePage() {
  const { currentRole } = useAppStore()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ car_type: '', service_package: '', estimated_arrival_minutes: 30, payment_method: '', plate_number: '' })
  const [checking, setChecking] = useState(false)
  const [eligible, setEligible] = useState<{ ok: boolean; reasons: string[]; warnings: string[]; bayStatus?: any; queueLength?: number } | null>(null)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState('')

  const pkg = PACKAGES.find(p => p.key === form.service_package)
  const total = (pkg?.price ?? 0) + (SURCHARGE[form.car_type] ?? 0)
  const estWait = form.estimated_arrival_minutes * 2

  const canNext = () => {
    if (step === 0) return !!form.car_type
    if (step === 1) return !!form.service_package
    if (step === 2) return form.estimated_arrival_minutes > 0
    if (step === 3) return !!form.payment_method
    return false
  }

  const handleCheck = async () => {
    setChecking(true)
    setEligible(null)
    try {
      const res = await checkEligibility({
        car_type: form.car_type,
        service_package: form.service_package,
        payment_method: form.payment_method,
        plate_number: form.plate_number,
        estimated_arrival_minutes: form.estimated_arrival_minutes,
      })
      setEligible({
        ok: res.eligible,
        reasons: res.reasons || [],
        warnings: res.warnings || [],
        bayStatus: res.bayStatus,
        queueLength: res.queueLength,
      })
    } catch (e: any) {
      setEligible({ ok: false, reasons: [e.message], warnings: [] })
    }
    setChecking(false)
  }

  const handleJoin = async () => {
    setJoining(true)
    setError('')
    try {
      await joinQueue({ ...form, plate_number: form.plate_number || `临时${Date.now().toString(36)}` })
      setJoined(true)
    } catch (e: any) {
      setError(e.message)
    }
    setJoining(false)
  }

  if (joined) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <CheckCircle className="text-emerald-400" size={64} />
        <div className="text-xl font-bold">排队成功！</div>
        <div className="text-slate-400">请留意叫号通知</div>
        <div className="text-sm text-slate-500">
          车牌: <span className="font-mono">{form.plate_number || '未填写'}</span> ·
          预计到店: <span className="font-mono">{form.estimated_arrival_minutes}分钟</span> ·
          请在 <span className="text-yellow-400">到店后{LATE_THRESHOLD_MINUTES_DEFAULT}分钟内</span> 到场
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <User size={18} className="text-cyan-400" /> 车主排队登记
        </h2>
        <div className="text-xs text-slate-400 flex items-center gap-1">
          <ShieldCheck size={12} /> {currentRole}视图
        </div>
      </div>

      {eligible?.bayStatus && (
        <div className="bg-slate-800/60 rounded-lg p-3 border border-white/10 grid grid-cols-4 gap-2 text-xs">
          <div className="text-center">
            <div className="text-emerald-400 font-bold text-lg">{eligible.bayStatus.idle}</div>
            <div className="text-slate-400">空闲</div>
          </div>
          <div className="text-center">
            <div className="text-blue-400 font-bold text-lg">{eligible.bayStatus.occupied}</div>
            <div className="text-slate-400">使用中</div>
          </div>
          <div className="text-center">
            <div className="text-orange-400 font-bold text-lg">{eligible.bayStatus.fault}</div>
            <div className="text-slate-400">故障</div>
          </div>
          <div className="text-center">
            <div className="text-yellow-400 font-bold text-lg">{eligible.queueLength ?? 0}</div>
            <div className="text-slate-400">排队中</div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-center gap-2 text-sm">
        {['选择车型', '选择套餐', '到店时间', '支付方式', '确认排队'].map((l, i) => (
          <span key={i} className={`flex items-center gap-1 ${i <= step ? 'text-cyan-400' : 'text-slate-500'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i <= step ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700 text-slate-500'}`}>{i + 1}</span>
            <span className="hidden sm:inline">{l}</span>
            {i < 4 && <span className="mx-1 text-slate-600">›</span>}
          </span>
        ))}
      </div>

      {step === 0 && (
        <div className="grid grid-cols-2 gap-4">
          {CAR_TYPES.map(ct => (
            <button key={ct.key} onClick={() => setForm(f => ({ ...f, car_type: ct.key }))}
              className={`p-6 rounded-lg border-2 text-center transition-all ${form.car_type === ct.key ? 'border-cyan-400 scale-105 shadow-lg shadow-cyan-500/20' : 'border-white/10 bg-slate-800'}`}>
              <ct.icon size={32} className="mx-auto mb-2 text-cyan-400" />
              <div className="font-semibold">{ct.label}</div>
              {SURCHARGE[ct.key] > 0 && <div className="text-xs text-orange-400 font-mono">+¥{SURCHARGE[ct.key]}</div>}
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          {PACKAGES.map(p => (
            <button key={p.key} onClick={() => setForm(f => ({ ...f, service_package: p.key }))}
              className={`w-full p-4 rounded-lg border-2 flex items-center justify-between transition-all ${form.service_package === p.key ? 'border-cyan-400 shadow-lg shadow-cyan-500/20' : 'border-white/10 bg-slate-800'}`}>
              <div>
                <div className="font-semibold flex items-center gap-2">
                  {p.label}
                  {p.recommended && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded"><Star size={10} className="inline" /> 推荐</span>}
                  {form.service_package === p.key && <span className="text-xs bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded">已选</span>}
                </div>
                <div className="text-xs text-slate-400">轿车起步 ¥{p.price}{SURCHARGE[form.car_type] > 0 ? ` + ¥${SURCHARGE[form.car_type]}车型费` : ''}</div>
              </div>
              <div className="font-mono text-lg font-bold">¥{p.price + (SURCHARGE[form.car_type] ?? 0)}</div>
            </button>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {ARRIVAL_OPTIONS.map(m => (
              <button key={m} onClick={() => setForm(f => ({ ...f, estimated_arrival_minutes: m }))}
                className={`px-5 py-3 rounded-lg border-2 font-mono transition-all ${form.estimated_arrival_minutes === m ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10 bg-slate-800'}`}>
                {m}分钟
              </button>
            ))}
          </div>
          <div className="text-sm text-slate-400 bg-slate-800/50 p-3 rounded-lg">
            预计排队等待时间: <span className="font-mono text-cyan-400">~{estWait}分钟</span>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          {PAYMENT_OPTIONS.map(p => (
            <button key={p.key} onClick={() => setForm(f => ({ ...f, payment_method: p.key }))}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${form.payment_method === p.key ? 'border-cyan-400' : 'border-white/10 bg-slate-800'}`}>
              <div className="font-semibold">{p.label}</div>
              {p.warning && (
                <div className="flex items-center gap-1 mt-1 text-xs text-orange-400">
                  <AlertTriangle size={12} />{p.warning}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="bg-slate-800 rounded-lg p-4 border border-white/10 space-y-2">
            <div className="text-center text-lg font-bold mb-3">确认排队信息</div>
            <div className="flex justify-between"><span className="text-slate-400">车型</span><span>{CAR_TYPES.find(c => c.key === form.car_type)?.label}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">套餐</span><span>{PACKAGES.find(p => p.key === form.service_package)?.label}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">预计到店</span><span className="font-mono">{form.estimated_arrival_minutes}分钟</span></div>
            <div className="flex justify-between"><span className="text-slate-400">支付方式</span><span>{PAYMENT_OPTIONS.find(p => p.key === form.payment_method)?.label}</span></div>
            <div className="border-t border-white/10 pt-2 flex justify-between font-bold">
              <span>总计</span><span className="font-mono text-cyan-400">¥{total}</span>
            </div>
          </div>
          <input value={form.plate_number} onChange={e => setForm(f => ({ ...f, plate_number: e.target.value }))}
            placeholder="输入车牌号（选填）" className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-sm" />
          {!eligible && (
            <button onClick={handleCheck} disabled={checking}
              className="w-full py-3 rounded-lg bg-cyan-500/20 text-cyan-400 font-semibold hover:bg-cyan-500/30 transition-colors disabled:opacity-50">
              {checking ? '检查中...' : '检查排队资格'}
            </button>
          )}
          {eligible?.ok && eligible.warnings?.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 text-yellow-400 font-semibold mb-1 text-sm">
                <AlertTriangle size={14} />温馨提示
              </div>
              {eligible.warnings.map((w, i) => <div key={i} className="text-xs text-yellow-300">• {w}</div>)}
            </div>
          )}
          {eligible?.ok && (
            <button onClick={handleJoin} disabled={joining}
              className="w-full py-3 rounded-lg bg-cyan-500 text-white font-semibold hover:bg-cyan-600 transition-colors disabled:opacity-50">
              {joining ? '加入中...' : '加入队列'}
            </button>
          )}
          {eligible && !eligible.ok && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-400 font-semibold mb-2"><XCircle size={18} />不符合排队条件</div>
              {eligible.reasons.map((r, i) => <div key={i} className="text-sm text-red-300">• {r}</div>)}
            </div>
          )}
          {error && <div className="text-sm text-red-400">{error}</div>}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        {step > 0 && step < 5 && (
          <button onClick={() => setStep(s => s - 1)} className="flex-1 py-2 rounded-lg border border-white/10 text-slate-400 hover:bg-white/5">上一步</button>
        )}
        {step < 4 && (
          <button onClick={() => setStep(s => s + 1)} disabled={!canNext()}
            className="flex-1 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 font-semibold hover:bg-cyan-500/30 disabled:opacity-30 disabled:cursor-not-allowed">下一步</button>
        )}
      </div>
    </div>
  )
}
