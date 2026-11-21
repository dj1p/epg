import { NextRequest } from 'next/server'
import { getJobMeta, getJobLog } from '@/lib/jobStorage'
import { subscribeToJob, reconcileJobMeta, isJobActiveInProcess } from '@/lib/jobRunner'
import { isAuthorized } from '@/lib/session'

const POLL_INTERVAL_MS = 1000

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(request)) {
    return new Response('unauthorized', { status: 401 })
  }

  const { id } = await params
  const rawJob = getJobMeta(id)
  if (!rawJob) {
    return new Response('not found', { status: 404 })
  }
  // If this job was left `running` by a previous process instance, this
  // process has no live emitter for it and will never see a 'done' event —
  // reconcile it to `interrupted` first so the branch below sends a
  // snapshot + done and closes, instead of opening an indefinite
  // subscription that can never resolve.
  const job = reconcileJobMeta(rawJob)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      let log = getJobLog(id)
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ log })}\n\n`))

      if (job.status !== 'running') {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, status: job.status })}\n\n`))
        controller.close()
        return
      }

      // A run started by this process (manual) is followed through its event
      // emitter. A scheduled run belongs to another process (pm2/chronos), so
      // there is no emitter to subscribe to: follow its log file instead.
      if (!isJobActiveInProcess(id)) {
        const timer = setInterval(() => {
          try {
            const latest = getJobLog(id)
            if (latest.length > log.length) {
              const line = latest.slice(log.length)
              log = latest
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line })}\n\n`))
            }
            const meta = getJobMeta(id)
            const current = meta ? reconcileJobMeta(meta) : undefined
            if (!current || current.status !== 'running') {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ done: true, status: current?.status ?? 'interrupted' })}\n\n`)
              )
              clearInterval(timer)
              controller.close()
            }
          } catch {
            clearInterval(timer)
          }
        }, POLL_INTERVAL_MS)

        request.signal.addEventListener('abort', () => {
          clearInterval(timer)
        })
        return
      }

      const unsubscribe = subscribeToJob(
        id,
        line => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line })}\n\n`))
        },
        meta => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, status: meta.status })}\n\n`))
          controller.close()
          unsubscribe()
        }
      )

      request.signal.addEventListener('abort', () => {
        unsubscribe()
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  })
}
