import { Pushable, pushable } from 'it-pushable'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { toString as uint8ArrayToString } from 'uint8arrays/to-string'
import { abortableSource } from 'abortable-iterator'
import { anySignal } from 'any-signal'
import errCode from 'err-code'
import { Logger, logger } from '@libp2p/logger'
import * as ndjson from 'it-ndjson'
import type { Stream } from '@libp2p/interfaces/connection'
import type { Muxer, MuxerOptions } from '@libp2p/interfaces/stream-muxer'
import type { Source } from 'it-stream-types'
import { pipe } from 'it-pipe'
import map from 'it-map'

let muxers = 0
let streams = 0

interface DataMessage {
  id: string
  type: 'data'
  direction: 'initiator' | 'recipient'
  chunk: string
}

interface ResetMessage {
  id: string
  type: 'reset'
  direction: 'initiator' | 'recipient'
}

interface CloseMessage {
  id: string
  type: 'close'
  direction: 'initiator' | 'recipient'
}

interface CreateMessage {
  id: string
  type: 'create'
  direction: 'initiator'
}

type StreamMessage = DataMessage | ResetMessage | CloseMessage | CreateMessage

class MuxedStream {
  public id: string
  public input: Pushable<Uint8Array>
  public stream: Stream
  public type: 'initiator' | 'recipient'

  private sinkEnded: boolean
  private sourceEnded: boolean
  private readonly abortController: AbortController
  private readonly resetController: AbortController
  private readonly log: Logger

  constructor (opts: { id: string, type: 'initiator' | 'recipient', push: Pushable<StreamMessage>, onEnd: (err?: Error) => void }) {
    const { id, type, push, onEnd } = opts

    this.log = logger(`libp2p:mock-muxer:stream:${id}:${type}`)

    this.id = id
    this.type = type
    this.abortController = new AbortController()
    this.resetController = new AbortController()

    this.sourceEnded = false
    this.sinkEnded = false

    let endErr: Error | undefined

    const onSourceEnd = (err?: Error) => {
      if (this.sourceEnded) {
        return
      }

      this.log('onSourceEnd sink ended? %s', this.sinkEnded)

      this.sourceEnded = true

      if (err != null && endErr == null) {
        endErr = err
      }

      if (this.sinkEnded) {
        this.stream.timeline.close = Date.now()

        if (onEnd != null) {
          onEnd(endErr)
        }
      }
    }

    const onSinkEnd = (err?: Error) => {
      if (this.sinkEnded) {
        return
      }

      this.log('onSinkEnd source ended? %s', this.sourceEnded)

      this.sinkEnded = true

      if (err != null && endErr == null) {
        endErr = err
      }

      if (this.sourceEnded) {
        this.stream.timeline.close = Date.now()

        if (onEnd != null) {
          onEnd(endErr)
        }
      }
    }

    this.input = pushable<Uint8Array>({
      onEnd: onSourceEnd
    })

    this.stream = {
      id,
      sink: async (source) => {
        source = abortableSource(source, anySignal([
          this.abortController.signal,
          this.resetController.signal
        ]))

        try {
          if (this.type === 'initiator') {
            // If initiator, open a new stream
            const createMsg: CreateMessage = {
              id: this.id,
              type: 'create',
              direction: this.type
            }
            push.push(createMsg)
          }

          for await (const chunk of source) {
            const dataMsg: DataMessage = {
              id,
              type: 'data',
              chunk: uint8ArrayToString(chunk, 'base64'),
              direction: this.type
            }

            push.push(dataMsg)
          }
        } catch (err: any) {
          if (err.type === 'aborted' && err.message === 'The operation was aborted') {
            if (this.resetController.signal.aborted) {
              err.message = 'stream reset'
              err.code = 'ERR_STREAM_RESET'
            }

            if (this.abortController.signal.aborted) {
              err.message = 'stream aborted'
              err.code = 'ERR_STREAM_ABORT'
            }
          }

          // Send no more data if this stream was remotely reset
          if (err.code !== 'ERR_STREAM_RESET') {
            const resetMsg: ResetMessage = {
              id,
              type: 'reset',
              direction: this.type
            }
            push.push(resetMsg)
          }

          this.log('sink erred', err)

          this.input.end(err)
          onSinkEnd(err)
          return
        }

        this.log('sink ended')

        onSinkEnd()

        const closeMsg: CloseMessage = {
          id,
          type: 'close',
          direction: this.type
        }
        push.push(closeMsg)
      },
      source: this.input,

      // Close for reading
      close: () => {
        this.input.end()
      },

      // Close for reading and writing (local error)
      abort: (err?: Error) => {
        // End the source with the passed error
        this.input.end()
        this.abortController.abort()
        onSinkEnd(err)
      },

      // Close immediately for reading and writing (remote error)
      reset: () => {
        const err = errCode(new Error('stream reset'), 'ERR_STREAM_RESET')
        this.resetController.abort()
        this.input.end(err)
        onSinkEnd(err)
      },
      timeline: {
        open: Date.now()
      }
    }
  }
}

class MockMuxer implements Muxer {
  public source: Source<Uint8Array>
  public input: Pushable<Uint8Array>
  public streamInput: Pushable<StreamMessage>
  public name: string

  private readonly registryInitiatorStreams: Map<string, MuxedStream>
  private readonly registryRecipientStreams: Map<string, MuxedStream>
  private readonly options: MuxerOptions

  private readonly log: Logger

  constructor (options?: MuxerOptions) {
    this.name = `muxer:${muxers++}`
    this.log = logger(`libp2p:mock-muxer:${this.name}`)
    this.registryInitiatorStreams = new Map()
    this.registryRecipientStreams = new Map()
    this.log('create muxer')
    this.options = options ?? {}
    // receives data from the muxer at the other end of the stream
    this.source = this.input = pushable<Uint8Array>({
      onEnd: (err) => {
        this.log('closing muxed streams')
        for (const stream of this.streams) {
          stream.abort(err)
        }
      }
    })

    // receives messages from all of the muxed streams
    this.streamInput = pushable<StreamMessage>()
  }

  // receive incoming messages
  async sink (source: Source<Uint8Array>) {
    try {
      await pipe(
        source,
        (source) => map(source, buf => uint8ArrayToString(buf)),
        ndjson.parse,
        async (source) => {
          for await (const message of source) {
            this.log('-> %s %s %s', message.type, message.direction, message.id)
            this.handleMessage(message)
          }
        }
      )

      this.log('muxed stream ended')
      this.input.end()
    } catch (err: any) {
      this.log('muxed stream errored', err)
      this.input.end(err)
    }
  }

  handleMessage (message: StreamMessage) {
    let muxedStream: MuxedStream | undefined

    const registry = message.direction === 'initiator' ? this.registryRecipientStreams : this.registryInitiatorStreams

    if (message.type === 'create') {
      if (registry.has(message.id)) {
        throw new Error(`Already had stream for ${message.id}`)
      }

      muxedStream = this.createStream(message.id, 'recipient')
      registry.set(muxedStream.stream.id, muxedStream)

      if (this.options.onIncomingStream != null) {
        this.options.onIncomingStream(muxedStream.stream)
      }
    }

    muxedStream = registry.get(message.id)

    if (muxedStream == null) {
      throw new Error(`No stream found for ${message.id}`)
    }

    if (message.type === 'data') {
      muxedStream.input.push(uint8ArrayFromString(message.chunk, 'base64'))
    } else if (message.type === 'reset') {
      this.log('-> reset stream %s %s', muxedStream.type, muxedStream.stream.id)
      muxedStream.stream.reset()
    } else if (message.type === 'close') {
      this.log('-> closing stream %s %s', muxedStream.type, muxedStream.stream.id)
      muxedStream.stream.close()
    }
  }

  get streams () {
    return Array.from(this.registryRecipientStreams.values())
      .concat(Array.from(this.registryInitiatorStreams.values()))
      .map(({ stream }) => stream)
  }

  newStream (name?: string) {
    this.log('newStream %s', name)
    const storedStream = this.createStream(name, 'initiator')
    this.registryInitiatorStreams.set(storedStream.stream.id, storedStream)

    return storedStream.stream
  }

  createStream (name?: string, type: 'initiator' | 'recipient' = 'initiator'): MuxedStream {
    const id = name ?? `${this.name}:stream:${streams++}`

    this.log('createStream %s %s', type, id)

    const muxedStream: MuxedStream = new MuxedStream({
      id,
      type,
      push: this.streamInput,
      onEnd: () => {
        this.log('stream ended %s %s', type, id)

        if (type === 'initiator') {
          this.registryInitiatorStreams.delete(id)
        } else {
          this.registryRecipientStreams.delete(id)
        }

        if (this.options.onStreamEnd != null) {
          this.options.onStreamEnd(muxedStream.stream)
        }
      }
    })

    return muxedStream
  }
}

export function mockMuxer (options?: MuxerOptions): Muxer {
  const mockMuxer = new MockMuxer(options)

  void Promise.resolve().then(async () => {
    void pipe(
      mockMuxer.streamInput,
      ndjson.stringify,
      (source) => map(source, str => uint8ArrayFromString(str)),
      async (source) => {
        for await (const buf of source) {
          mockMuxer.input.push(buf)
        }
      }
    )
  })

  return mockMuxer
}
