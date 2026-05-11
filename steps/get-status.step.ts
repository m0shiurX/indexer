import type { ApiRouteConfig, Handlers } from 'motia'
import type { ApiKeyState } from './config/types'
import { STATE_API_KEYS, STATE_PENDING_QUEUE } from './config/constants'
import { jsonResponse } from './config/http-helpers'

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'GetStatus',
  method: 'GET',
  path: '/api/status',
  emits: [],
  flows: ['url-indexing'],
}

export const handler: Handlers['GetStatus'] = async (_request, { state, logger }) => {
  try {
    const [keys, pendingQueue] = await Promise.all([
      state.getGroup<ApiKeyState>(STATE_API_KEYS),
      state.getGroup<{ url: string; timestamp: string }>(STATE_PENDING_QUEUE),
    ])

    const totalUsed = keys.reduce((sum, k) => sum + (k.dailyUsed ?? 0), 0)
    const totalCapacity = keys.reduce((sum, k) => sum + (k.dailyLimit ?? 0), 0)

    // Exclude credentialsPath from response
    const keyStats = keys.map(({ credentialsPath, ...rest }) => rest)

    logger.info(`Status fetched: ${keys.length} keys, ${pendingQueue.length} pending`)
    return jsonResponse(200, { keys: keyStats, pendingQueueSize: pendingQueue.length, totalUsed, totalCapacity })
  } catch (err) {
    logger.error('Failed to fetch status', { error: err })
    return jsonResponse(500, { error: 'Failed to fetch status' })
  }
}
