import { useState } from 'react'
import { X } from 'lucide-react'

const FAULT_TYPES = [
  { key: 'equipment', label: '设备故障' },
  { key: 'power', label: '电力故障' },
  { key: 'water', label: '供水故障' },
  { key: 'other', label: '其他' },
]

const SEVERITIES = [
  { key: 'minor', label: '一般', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  { key: 'major', label: '严重', color: 'text-orange-400', bg: 'bg-orange-500/20' },
  { key: 'critical', label: '紧急', color: 'text-red-400', bg: 'bg-red-500/20' },
]

export default function FaultModal({ bayId, bayName, onClose, onSubmit }: {
  bayId: number
  bayName: string
  onClose: () => void
  onSubmit: (data: { bay_id: number; fault_type: string; severity: string; description: string }) => void
}) {
  const [faultType, setFaultType] = useState('equipment')
  const [severity, setSeverity] = useState('minor')
  const [desc, setDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    await onSubmit({ bay_id: bayId, fault_type: faultType, severity, description: desc })
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg border border-white/10 shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <span className="font-semibold">报告故障 — {bayName}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm text-slate-400 mb-1 block">故障类型</label>
            <div className="grid grid-cols-2 gap-2">
              {FAULT_TYPES.map(ft => (
                <button key={ft.key} onClick={() => setFaultType(ft.key)}
                  className={`py-2 rounded text-sm border transition-colors ${faultType === ft.key ? 'border-cyan-400 bg-cyan-500/10 text-cyan-400' : 'border-white/10 text-slate-300'}`}>
                  {ft.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-slate-400 mb-1 block">严重程度</label>
            <div className="flex gap-2">
              {SEVERITIES.map(sv => (
                <button key={sv.key} onClick={() => setSeverity(sv.key)}
                  className={`flex-1 py-2 rounded text-sm border transition-colors ${severity === sv.key ? `${sv.bg} ${sv.color} border-current` : 'border-white/10 text-slate-300'}`}>
                  {sv.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-slate-400 mb-1 block">描述</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm resize-none" placeholder="请描述故障详情..." />
          </div>
        </div>
        <div className="p-4 border-t border-white/10 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/10 text-slate-400">取消</button>
          <button onClick={handleSubmit} disabled={submitting}
            className="flex-1 py-2 rounded-lg bg-orange-500/20 text-orange-400 font-semibold hover:bg-orange-500/30 disabled:opacity-50">
            {submitting ? '提交中...' : '提交'}
          </button>
        </div>
      </div>
    </div>
  )
}
