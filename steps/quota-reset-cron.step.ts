import type { CronConfig, Handlers } from 'motia'
import type { ApiKeyState } from './config/types'
import { TOPIC_GOOGLE_INDEX, STATE_API_KEYS, STATE_PENDING_QUEUE } from './config/constants'

export const config: CronConfig = {
  type: 'cron',
  name: 'QuotaResetCron',
  description: 'Daily midnight UTC quota reset + pending queue drain',
  cron: '0 0 0 * * *',
  emits: [TOPIC_GOOGLE_INDEX],
  flows: ['url-indexing'],
}

export const handler: Handlers['QuotaResetCron'] = async ({ state, emit, logger }) => {
  const [keys, pendingUrls] = await Promise.all([
    state.getGroup<ApiKeyState>(STATE_API_KEYS),
    state.getGroup<{ url: string }>(STATE_PENDING_QUEUE),
  ])

  // Reset all key quotas in parallel
  await Promise.all(
    keys.map((key) =>
      state.set(STATE_API_KEYS, key.id, { ...key, dailyUsed: 0, lastReset: new Date().toISOString() })
    )
  )

  // Drain pending queue: re-enqueue and delete in parallel
  await Promise.all(
    pendingUrls.map(async (entry) => {
      await emit({ topic: TOPIC_GOOGLE_INDEX, data: { url: entry.url } })
      await state.delete(STATE_PENDING_QUEUE, entry.url)
    })
  )

  logger.info(`Reset ${keys.length} keys, drained ${pendingUrls.length} pending URLs`)
}
