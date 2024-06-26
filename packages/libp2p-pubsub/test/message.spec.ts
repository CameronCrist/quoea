/* eslint-env mocha */
import { expect } from 'aegir/utils/chai.js'
import sinon from 'sinon'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { PubsubBaseProtocol } from '../src/index.js'
import {
  createPeerId,
  MockRegistrar
} from './utils/index.js'
import type { PeerId } from '@libp2p/interfaces/peer-id'
import type { Message } from '@libp2p/interfaces/src/pubsub'

class PubsubProtocol extends PubsubBaseProtocol {
  async publishMessage (): Promise<void> {
    throw new Error('Method not implemented.')
  }
}

describe('pubsub base messages', () => {
  let peerId: PeerId
  let pubsub: PubsubProtocol

  before(async () => {
    peerId = await createPeerId()
    pubsub = new PubsubProtocol({
      debugName: 'pubsub',
      multicodecs: ['/pubsub/1.0.0'],
      peerId: peerId,
      registrar: new MockRegistrar()
    })
  })

  afterEach(() => {
    sinon.restore()
  })

  it('buildMessage normalizes and signs messages', async () => {
    const message: Message = {
      from: peerId,
      data: uint8ArrayFromString('hello'),
      topic: 'test-topic'
    }

    const signedMessage = await pubsub.buildMessage(message)

    await expect(pubsub.validate(signedMessage)).to.eventually.not.be.rejected()
  })

  it('validate with StrictNoSign will reject a message with from, signature, key, seqno present', async () => {
    const message: Message = {
      from: peerId,
      data: uint8ArrayFromString('hello'),
      topic: 'test-topic'
    }

    sinon.stub(pubsub, 'globalSignaturePolicy').value('StrictSign')

    const signedMessage = await pubsub.buildMessage(message)

    sinon.stub(pubsub, 'globalSignaturePolicy').value('StrictNoSign')
    await expect(pubsub.validate(signedMessage)).to.eventually.be.rejected()
    // @ts-expect-error this field is not optional
    delete signedMessage.from
    await expect(pubsub.validate(signedMessage)).to.eventually.be.rejected()
    delete signedMessage.signature
    await expect(pubsub.validate(signedMessage)).to.eventually.be.rejected()
    delete signedMessage.key
    await expect(pubsub.validate(signedMessage)).to.eventually.be.rejected()
    delete signedMessage.seqno
    await expect(pubsub.validate(signedMessage)).to.eventually.not.be.rejected()
  })

  it('validate with StrictNoSign will validate a message without a signature, key, and seqno', async () => {
    const message: Message = {
      from: peerId,
      data: uint8ArrayFromString('hello'),
      topic: 'test-topic'
    }

    sinon.stub(pubsub, 'globalSignaturePolicy').value('StrictNoSign')

    const signedMessage = await pubsub.buildMessage(message)
    await expect(pubsub.validate(signedMessage)).to.eventually.not.be.rejected()
  })

  it('validate with StrictSign requires a signature', async () => {
    const message: Message = {
      from: peerId,
      data: uint8ArrayFromString('hello'),
      topic: 'test-topic'
    }

    await expect(pubsub.validate(message)).to.be.rejectedWith(Error, 'Signing required and no signature was present')
  })
})
