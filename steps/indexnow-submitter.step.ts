import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { updateSubmission } from './config/submission-helpers'
import { TOPIC_INDEXNOW_INDEX, TOPIC_SUBMISSION_RETRY } from './config/constants'

export const config: EventConfig = {
  type: 'event',
  name: 'IndexNowSubmitter',
  description: 'Submits URL to IndexNow API (Bing, Yandex, DuckDuckGo)',
  subscribes: [TOPIC_INDEXNOW_INDEX],
  emits: [TOPIC_SUBMISSION_RETRY],
  flows: ['url-indexing'],
  input: z.object({
    url: z.string(),
    retryCount: z.number().optional(),
  }),
}

export const handler: Handlers['IndexNowSubmitter'] = async (input, { state, emit, logger }) => {
  const { url, retryCount = 0 } = input as { url: string; retryCount?: number }

  const key = process.env.INDEXNOW_KEY
  const host = process.env.INDEXNOW_HOST
  const keyLocation = process.env.INDEXNOW_KEY_LOCATION

  if (!key || !host || !keyLocation) {
    logger.error('Missing IndexNow env vars: INDEXNOW_KEY, INDEXNOW_HOST, INDEXNOW_KEY_LOCATION')
    await updateSubmission(state, url, { indexNowStatus: 'failed' })
    return
  }

  try {
    const response = await fetch('https://api.indexnow.org/IndexNow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation, urlList: [url] }),
    })

    if (response.status === 200 || response.status === 202) {
      await updateSubmission(state, url, { indexNowStatus: 'success' })
      logger.info(`IndexNow success for ${url}`)
    } else if (response.status === 429) {
      logger.warn(`IndexNow rate limited for ${url}, scheduling retry`)
      await emit({ topic: TOPIC_SUBMISSION_RETRY, data: { url, service: 'indexnow', retryCount: retryCount + 1 } })
    } else {
      logger.error(`IndexNow error ${response.status} for ${url}`)
      await updateSubmission(state, url, { indexNowStatus: 'failed' })
    }
  } catch (err) {
    logger.error(`IndexNow network error for ${url}: ${String(err)}`)
    // Delegate retry decision to retry-handler instead of duplicating logic here
    await emit({ topic: TOPIC_SUBMISSION_RETRY, data: { url, service: 'indexnow', retryCount: retryCount + 1 } })
  }
}
