import { google } from 'googleapis'
import { z } from 'zod'
import { getNextAvailableKey, incrementUsage } from './config/google-auth-manager'
import { updateSubmission } from './config/submission-helpers'
import { TOPIC_GOOGLE_INDEX, TOPIC_SUBMISSION_RETRY, STATE_PENDING_QUEUE } from './config/constants'
import type { EventConfig, Handlers } from 'motia'

export const config: EventConfig = {
  type: 'event',
  name: 'GoogleIndexer',
  description: 'Submits URL to Google Indexing API with key rotation',
  subscribes: [TOPIC_GOOGLE_INDEX],
  emits: [TOPIC_SUBMISSION_RETRY],
  flows: ['url-indexing'],
  input: z.object({
    url: z.string(),
    retryCount: z.number().optional(),
  }),
}

export const handler: Handlers['GoogleIndexer'] = async (input, { state, emit, logger }) => {
  const { url, retryCount = 0 } = input as { url: string; retryCount?: number }

  const keyResult = await getNextAvailableKey(state)

  if (!keyResult) {
    logger.warn(`All Google API keys exhausted, queuing URL: ${url}`)
    await state.set(STATE_PENDING_QUEUE, url, { url, timestamp: new Date().toISOString() })
    await updateSubmission(state, url, { googleStatus: 'queued' })
    return
  }

  const { auth, keyId } = keyResult

  try {
    const indexing = google.indexing({ version: 'v3', auth })
    await indexing.urlNotifications.publish({
      requestBody: { url, type: 'URL_UPDATED' },
    })

    await incrementUsage(state, keyId)
    await updateSubmission(state, url, { googleStatus: 'success', keyUsed: keyId, retryCount })

    logger.info(`Google indexing success for URL: ${url}, key: ${keyId}`)
  } catch (err: any) {
    const httpStatus: number = typeof err?.response?.status === 'number' ? err.response.status : 0

    if (httpStatus === 429 || httpStatus >= 500) {
      logger.warn(`Google transient error (${httpStatus}) for ${url}, retry #${retryCount + 1}`)
      await emit({ topic: TOPIC_SUBMISSION_RETRY, data: { url, service: 'google', retryCount: retryCount + 1 } })
    } else {
      logger.error(`Google permanent error (${httpStatus}) for ${url} — ${err?.message}`)
      await updateSubmission(state, url, { googleStatus: 'failed', keyUsed: keyId, retryCount })
    }
  }
}
