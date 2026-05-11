import type { EventConfig, Handlers } from 'motia'
import { z } from 'zod'
import type { SubmissionState } from './config/types'
import { TOPIC_URL_SUBMITTED, TOPIC_GOOGLE_INDEX, TOPIC_INDEXNOW_INDEX, STATE_SUBMISSIONS } from './config/constants'

export const config: EventConfig = {
  type: 'event',
  name: 'UrlDispatcher',
  description: 'Fan-out from url.submitted to Google + IndexNow queues',
  subscribes: [TOPIC_URL_SUBMITTED],
  emits: [TOPIC_GOOGLE_INDEX, TOPIC_INDEXNOW_INDEX],
  flows: ['url-indexing'],
  input: z.object({
    url: z.string(),
  }),
}

export const handler: Handlers['UrlDispatcher'] = async (input, { state, emit, logger }) => {
  const { url } = input as { url: string }

  const initialState: SubmissionState = {
    url,
    googleStatus: 'pending',
    indexNowStatus: 'pending',
    keyUsed: '',
    timestamp: new Date().toISOString(),
    retryCount: 0,
  }

  await state.set(STATE_SUBMISSIONS, url, initialState)
  await Promise.all([
    emit({ topic: TOPIC_GOOGLE_INDEX, data: { url } }),
    emit({ topic: TOPIC_INDEXNOW_INDEX, data: { url } }),
  ])

  logger.info(`Dispatched ${url} to Google + IndexNow`)
}
