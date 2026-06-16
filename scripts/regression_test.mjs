const BASE = 'http://localhost:3001/api'

let pass = 0, fail = 0

function assert(desc, expected, actual) {
  if (expected === actual) {
    console.log(`✅ ${desc}`)
    pass++
  } else {
    console.log(`❌ ${desc}`)
    console.log(`   期望: ${JSON.stringify(expected)}`)
    console.log(`   实际: ${JSON.stringify(actual)}`)
    fail++
  }
}

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return await res.json()
}

async function main() {
  console.log('\n==============================')
  console.log('  支付阻断回归测试')
  console.log('==============================\n')

  // Step 0: Check bays
  console.log('[初始化] 检查系统状态...')
  const b0 = await req('GET', '/bays')
  const bayCount = b0.data?.length ?? 0
  console.log(`  车位数: ${bayCount}`)

  // Step 1: Check eligibility
  console.log('\n[步骤1] 车主检查排队资格')
  const e0 = await req('POST', '/queue/check-eligibility', {
    plate_number: '京A88888', car_type: 'sedan', service_package: 'standard',
    payment_method: 'prepaid', estimated_arrival_minutes: 5,
  })
  assert('排队资格检查通过', true, e0.data?.eligible)

  // Step 2: Join queue UNPAID
  console.log('\n[步骤2] 车主加入排队(未支付)')
  const j0 = await req('POST', '/queue/join', {
    plate_number: '京A88888', car_type: 'sedan', service_package: 'standard',
    owner_name: '测试车主', phone: '13800138000', payment_method: 'prepaid',
    estimated_arrival_minutes: 5,
  })
  const orderId = j0.data?.orderId
  const queueId = j0.data?.queueEntryId
  console.log(`  订单ID=${orderId}, 排队ID=${queueId}`)
  assert('成功生成订单', true, orderId != null)

  // Step 3: Check queue shows unpaid
  console.log('\n[步骤3] 队列显示订单支付状态')
  const q0 = await req('GET', '/queue')
  const entry = (q0.data ?? []).find((q) => q.order_id === orderId)
  assert('队列中订单支付状态为unpaid', 'unpaid', entry?.payment_status)

  // Step 4: Call next UNPAID - CORE BLOCKING TEST
  console.log('\n[步骤4] 店员叫号(订单未支付) - ★核心阻断测试★')
  const c0 = await req('POST', '/queue/call-next')
  console.log(`  call-next返回: ${JSON.stringify(c0.data)}`)
  assert('返回paymentRequired=true', true, c0.data?.paymentRequired)
  assert('未分配车位(bayId=null/undefined)', true, c0.data?.bayId == null)

  // Step 4b: Verify order still queued
  console.log('\n[步骤4b] 订单状态仍为queued(未进入洗车)')
  const o0 = await req('GET', `/orders/${orderId}`)
  assert('订单状态=queued', 'queued', o0.data?.status)

  // Step 4c: Verify no bays occupied
  console.log('\n[步骤4c] 验证车位未被占用')
  const b1 = await req('GET', '/bays')
  const idleCount = (b1.data ?? []).filter((b) => b.status === 'idle').length
  const totalBays = b1.data?.length ?? 0
  assert(`所有${totalBays}个车位仍空闲`, totalBays, idleCount)

  // Step 5: Pay the order
  console.log('\n[步骤5] 车主完成订单支付')
  const p0 = await req('PATCH', `/orders/${orderId}/pay`)
  assert('支付成功,状态=paid', 'paid', p0.data?.paymentStatus)

  // Step 6: Start wash for PAID called order
  console.log('\n[步骤6] 已支付订单启动洗车 - 应成功分配车位')
  const s0 = await req('POST', `/orders/${orderId}/start-wash`, { operator_name: '测试店员' })
  console.log(`  start-wash返回: ${JSON.stringify(s0.data)}`)
  assert('启动洗车成功', true, s0.success)
  assert('已分配车位', true, s0.data?.bayId != null)

  // Step 6b: Verify order is washing
  console.log('\n[步骤6b] 订单进入washing状态')
  const o1 = await req('GET', `/orders/${orderId}`)
  assert('订单状态=washing', 'washing', o1.data?.status)

  // Step 7: Onsite payment order call blocking
  console.log('\n[步骤7] 到店支付订单叫号同样阻断')
  const j1 = await req('POST', '/queue/join', {
    plate_number: '京B99999', car_type: 'suv', service_package: 'premium',
    owner_name: '车主2', phone: '13900139000', payment_method: 'onsite',
    estimated_arrival_minutes: 10,
  })
  const orderId2 = j1.data?.orderId
  console.log(`  到店支付订单ID=${orderId2}`)

  const c1 = await req('POST', '/queue/call-next')
  assert('到店支付订单同样提示需先付款', true, c1.data?.paymentRequired)
  console.log(`  提示消息: ${c1.data?.message}`)

  // Step 8: Unpaid order cannot start wash
  console.log('\n[步骤8] 未支付订单直接startWash被拒绝')
  const s1 = await req('POST', `/orders/${orderId2}/start-wash`, { operator_name: '测试店员' })
  assert('未支付订单startWash失败', false, s1.success)
  console.log(`  错误消息: ${s1.error}`)

  // Summary
  console.log('\n==============================')
  console.log(`  测试结果: ${pass}/${pass + fail} 通过, ${fail} 失败`)
  console.log('==============================\n')
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
