import { randomBytes } from 'iso-random-stream'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { toString as uint8ArrayToString } from 'uint8arrays/to-string'
import { sha256 } from 'multiformats/hashes/sha2'
import type * as RPC from './message/rpc.js'
import type { Message, RPCMessage } from '@libp2p/interfaces/pubsub'
import { peerIdFromBytes } from '@libp2p/peer-id'
import { codes } from './errors.js'
import errcode from 'err-code'

/**
 * Generate a random sequence number
 */
export function randomSeqno (): BigInt {
  return BigInt(`0x${uint8ArrayToString(randomBytes(8), 'base16')}`)
}

/**
 * Generate a message id, based on the `key` and `seqno`
 */
export const msgId = (key: Uint8Array, seqno: BigInt) => {
  const seqnoBytes = uint8ArrayFromString(seqno.toString(16).padStart(16, '0'), 'base16')

  const msgId = new Uint8Array(key.length + seqnoBytes.length)
  msgId.set(key, 0)
  msgId.set(seqnoBytes, key.length)

  return msgId
}

/**
 * Generate a message id, based on message `data`
 */
export const noSignMsgId = (data: Uint8Array) => {
  return sha256.encode(data)
}

/**
 * Check if any member of the first set is also a member
 * of the second set
 */
export const anyMatch = (a: Set<number> | number[], b: Set<number> | number[]) => {
  let bHas
  if (Array.isArray(b)) {
    bHas = (val: number) => b.includes(val)
  } else {
    bHas = (val: number) => b.has(val)
  }

  for (const val of a) {
    if (bHas(val)) {
      return true
    }
  }

  return false
}

/**
 * Make everything an array
 */
export const ensureArray = function <T> (maybeArray: T | T[]) {
  if (!Array.isArray(maybeArray)) {
    return [maybeArray]
  }

  return maybeArray
}

export const toMessage = (message: RPC.RPC.IMessage): Message => {
  if (message.from == null) {
    throw errcode(new Error('RPC message was missing from'), codes.ERR_MISSING_FROM)
  }

  return {
    from: peerIdFromBytes(message.from),
    topic: message.topic ?? '',
    seqno: message.seqno == null ? undefined : BigInt(`0x${uint8ArrayToString(message.seqno, 'base16')}`),
    data: message.data ?? new Uint8Array(0),
    signature: message.signature ?? undefined,
    key: message.key ?? undefined
  }
}

export const toRpcMessage = (message: Message): RPCMessage => {
  return {
    from: message.from.multihash.bytes,
    data: message.data,
    seqno: message.seqno == null ? undefined : uint8ArrayFromString(message.seqno.toString(16).padStart(16, '0'), 'base16'),
    topic: message.topic,
    signature: message.signature,
    key: message.key
  }
}
