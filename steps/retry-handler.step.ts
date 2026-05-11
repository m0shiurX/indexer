import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import { updateSubmission } from './config/submission-helpers'
import { TOPIC_SUBMISSION_RETRY, TOPIC_GOOGLE_INDEX, TOPIC_INDEXNOW_INDEX, MAX_RETRY_COUNT } from './config/constants'

export const config: EventConfig = {
  type: 'event',
  name: 'RetryHandler',
  description: 'Exponential backoff retry for failed submissions',
  subscribes: [TOPIC_SUBMISSION_RETRY],
  emits: [TOPIC_GOOGLE_INDEX, TOPIC_INDEXNOW_INDEX],
  flows: ['url-indexing'],
  input: z.object({
    url: z.string(),
    service: z.enum(['google', 'indexnow']),
    retryCount: z.number(),
  }),
}

export const handler: Handlers['RetryHandler'] = async (input, { state, emit, logger }) => {
  const { url, service, retryCount } = input as {
    url: string
    service: 'google' | 'indexnow'
    retryCount: number
  }

  const statusKey = service === 'google' ? 'googleStatus' : 'indexNowStatus'

  if (retryCount >= MAX_RETRY_COUNT) {
    logger.warn(`Max retries for ${url} (${service}), marking failed`)
    await updateSubmission(state, url, { [statusKey]: 'failed', retryCount })
    return
  }

  const delay = Math.min(Math.pow(2, retryCount) * 1000 + Math.random() * 1000, 60000)
  await new Promise((resolve) => setTimeout(resolve, delay))

  const topic = service === 'google' ? TOPIC_GOOGLE_INDEX : TOPIC_INDEXNOW_INDEX
  await emit({ topic, data: { url, retryCount } })

  logger.info(`Retrying ${url} for ${service} (attempt ${retryCount})`)
}
