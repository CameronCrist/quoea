import { expect } from 'aegir/utils/chai.js'
import sinon from 'sinon'
import pDefer from 'p-defer'
import pWaitFor from 'p-wait-for'
import { toString as uint8ArrayToString } from 'uint8arrays/to-string'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import { connectPeers, mockRegistrar } from '../mocks/registrar.js'
import { CustomEvent } from '@libp2p/interfaces'
import type { TestSetup } from '../index.js'
import type { Message, PubSubOptions } from '@libp2p/interfaces/pubsub'
import type { EventMap } from './index.js'
import type { PeerId } from '@libp2p/interfaces/src/peer-id'
import type { Registrar } from '@libp2p/interfaces/src/registrar'
import type { PubsubBaseProtocol } from '@libp2p/pubsub'

export default (common: TestSetup<PubsubBaseProtocol<EventMap>, PubSubOptions>) => {
  describe('pubsub connection handlers', () => {
    let psA: PubsubBaseProtocol<EventMap>
    let psB: PubsubBaseProtocol<EventMap>
    let peerA: PeerId
    let peerB: PeerId
    let registrarA: Registrar
    let registrarB: Registrar

    describe('nodes send state on connection', () => {
      // Create pubsub nodes and connect them
      before(async () => {
        peerA = await createEd25519PeerId()
        peerB = await createEd25519PeerId()

        registrarA = mockRegistrar()
        registrarB = mockRegistrar()

        psA = await common.setup({
          peerId: peerA,
          registrar: registrarA
        })
        psB = await common.setup({
          peerId: peerB,
          registrar: registrarB
        })

        // Start pubsub
        await psA.start()
        await psB.start()

        expect(psA.getPeers()).to.be.empty()
        expect(psB.getPeers()).to.be.empty()
      })

      // Make subscriptions prior to nodes connected
      before(() => {
        psA.subscribe('Za')
        psB.subscribe('Zb')

        expect(psA.getPeers()).to.be.empty()
        expect(psA.getTopics()).to.deep.equal(['Za'])
        expect(psB.getPeers()).to.be.empty()
        expect(psB.getTopics()).to.deep.equal(['Zb'])
      })

      after(async () => {
        sinon.restore()
        await common.teardown()
      })

      it('existing subscriptions are sent upon peer connection', async function () {
        const subscriptionsChanged = Promise.all([
          new Promise((resolve) => psA.addEventListener('pubsub:subscription-change', resolve, {
            once: true
          })),
          new Promise((resolve) => psB.addEventListener('pubsub:subscription-change', resolve, {
            once: true
          }))
        ])

        await connectPeers(psA.multicodecs[0], {
          peerId: peerA,
          registrar: registrarA
        }, {
          peerId: peerB,
          registrar: registrarB
        })

        await subscriptionsChanged

        expect(psA.getPeers()).to.have.lengthOf(1)
        expect(psB.getPeers()).to.have.lengthOf(1)

        expect(psA.getTopics()).to.deep.equal(['Za'])
        expect(psB.getTopics()).to.deep.equal(['Zb'])

        expect(psA.getSubscribers('Zb').map(p => p.toString())).to.deep.equal([peerB.toString()])
        expect(psB.getSubscribers('Za').map(p => p.toString())).to.deep.equal([peerA.toString()])
      })
    })

    describe('pubsub started before connect', () => {
      let psA: PubsubBaseProtocol<EventMap>
      let psB: PubsubBaseProtocol<EventMap>
      let peerA: PeerId
      let peerB: PeerId
      let registrarA: Registrar
      let registrarB: Registrar

      // Create pubsub nodes and start them
      beforeEach(async () => {
        peerA = await createEd25519PeerId()
        peerB = await createEd25519PeerId()

        registrarA = mockRegistrar()
        registrarB = mockRegistrar()

        psA = await common.setup({
          peerId: peerA,
          registrar: registrarA
        })
        psB = await common.setup({
          peerId: peerB,
          registrar: registrarB
        })

        await psA.start()
        await psB.start()
      })

      afterEach(async () => {
        sinon.restore()

        await common.teardown()
      })

      it('should get notified of connected peers on dial', async () => {
        await connectPeers(psA.multicodecs[0], {
          peerId: peerA,
          registrar: registrarA
        }, {
          peerId: peerB,
          registrar: registrarB
        })

        return await Promise.all([
          pWaitFor(() => psA.getPeers().length === 1),
          pWaitFor(() => psB.getPeers().length === 1)
        ])
      })

      it('should receive pubsub messages', async () => {
        const defer = pDefer()
        const topic = 'test-topic'
        const data = uint8ArrayFromString('hey!')

        await connectPeers(psA.multicodecs[0], {
          peerId: peerA,
          registrar: registrarA
        }, {
          peerId: peerB,
          registrar: registrarB
        })

        let subscribedTopics = psA.getTopics()
        expect(subscribedTopics).to.not.include(topic)

        psA.addEventListener(topic, (evt) => {
          const msg = evt.detail
          expect(msg.data).to.equalBytes(data)
          defer.resolve()
        })
        psA.subscribe(topic)

        subscribedTopics = psA.getTopics()
        expect(subscribedTopics).to.include(topic)

        // wait for psB to know about psA subscription
        await pWaitFor(() => {
          const subscribedPeers = psB.getSubscribers(topic)
          return subscribedPeers.map(p => p.toString()).includes(peerA.toString())
        })
        void psB.dispatchEvent(new CustomEvent(topic, { detail: data }))

        await defer.promise
      })
    })

    describe('pubsub started after connect', () => {
      let psA: PubsubBaseProtocol<EventMap>
      let psB: PubsubBaseProtocol<EventMap>
      let peerA: PeerId
      let peerB: PeerId
      let registrarA: Registrar
      let registrarB: Registrar

      // Create pubsub nodes
      beforeEach(async () => {
        peerA = await createEd25519PeerId()
        peerB = await createEd25519PeerId()

        registrarA = mockRegistrar()
        registrarB = mockRegistrar()

        psA = await common.setup({
          peerId: peerA,
          registrar: registrarA
        })
        psB = await common.setup({
          peerId: peerB,
          registrar: registrarB
        })
      })

      afterEach(async () => {
        sinon.restore()

        await psA.stop()
        await psB.stop()

        await common.teardown()
      })

      it('should get notified of connected peers after starting', async () => {
        await psA.start()
        await psB.start()

        await connectPeers(psA.multicodecs[0], {
          peerId: peerA,
          registrar: registrarA
        }, {
          peerId: peerB,
          registrar: registrarB
        })

        return await Promise.all([
          pWaitFor(() => psA.getPeers().length === 1),
          pWaitFor(() => psB.getPeers().length === 1)
        ])
      })

      it('should receive pubsub messages', async () => {
        const defer = pDefer()
        const topic = 'test-topic'
        const data = uint8ArrayFromString('hey!')

        await psA.start()
        await psB.start()

        await connectPeers(psA.multicodecs[0], {
          peerId: peerA,
          registrar: registrarA
        }, {
          peerId: peerB,
          registrar: registrarB
        })

        await Promise.all([
          pWaitFor(() => psA.getPeers().length === 1),
          pWaitFor(() => psB.getPeers().length === 1)
        ])

        let subscribedTopics = psA.getTopics()
        expect(subscribedTopics).to.not.include(topic)

        psA.addEventListener(topic, (evt) => {
          const msg = evt.detail
          expect(msg.data).to.equalBytes(data)
          defer.resolve()
        })
        psA.subscribe(topic)

        subscribedTopics = psA.getTopics()
        expect(subscribedTopics).to.include(topic)

        // wait for psB to know about psA subscription
        await pWaitFor(() => {
          const subscribedPeers = psB.getSubscribers(topic)
          return subscribedPeers.map(p => p.toString()).includes(peerA.toString())
        })
        void psB.dispatchEvent(new CustomEvent(topic, { detail: data }))

        await defer.promise
      })
    })

    describe('pubsub with intermittent connections', () => {
      let psA: PubsubBaseProtocol<EventMap>
      let psB: PubsubBaseProtocol<EventMap>
      let peerA: PeerId
      let peerB: PeerId
      let registrarA: Registrar
      let registrarB: Registrar

      // Create pubsub nodes and start them
      beforeEach(async () => {
        peerA = await createEd25519PeerId()
        peerB = await createEd25519PeerId()

        registrarA = mockRegistrar()
        registrarB = mockRegistrar()

        psA = await common.setup({
          peerId: peerA,
          registrar: registrarA
        })
        psB = await common.setup({
          peerId: peerB,
          registrar: registrarB
        })

        await psA.start()
        await psB.start()
      })

      afterEach(async () => {
        sinon.restore()

        await psA.stop()
        await psB.stop()

        await common.teardown()
      })

      it.skip('should receive pubsub messages after a node restart', async function () {
        const topic = 'test-topic'
        const data = uint8ArrayFromString('hey!')

        let counter = 0
        const defer1 = pDefer()
        const defer2 = pDefer()

        await connectPeers(psA.multicodecs[0], {
          peerId: peerA,
          registrar: registrarA
        }, {
          peerId: peerB,
          registrar: registrarB
        })

        let subscribedTopics = psA.getTopics()
        expect(subscribedTopics).to.not.include(topic)

        psA.addEventListener(topic, (evt) => {
          const msg = evt.detail
          expect(msg.data).to.equalBytes(data)
          counter++
          counter === 1 ? defer1.resolve() : defer2.resolve()
        })
        psA.subscribe(topic)

        subscribedTopics = psA.getTopics()
        expect(subscribedTopics).to.include(topic)

        // wait for psB to know about psA subscription
        await pWaitFor(() => {
          const subscribedPeers = psB.getSubscribers(topic)
          return subscribedPeers.map(p => p.toString()).includes(peerA.toString())
        })
        void psB.dispatchEvent(new CustomEvent(topic, { detail: data }))

        await defer1.promise

        await psB.stop()
        // @ts-expect-error protected fields
        await psB._libp2p.stop()
        await pWaitFor(() => {
          // @ts-expect-error protected fields
          const aHasConnectionToB = psA._libp2p.connectionManager.get(psB.peerId)
          // @ts-expect-error protected fields
          const bHasConnectionToA = psB._libp2p.connectionManager.get(psA.peerId)

          return aHasConnectionToB != null && bHasConnectionToA != null
        })
        // @ts-expect-error protected fields
        await psB._libp2p.start()
        await psB.start()

        await connectPeers(psA.multicodecs[0], {
          peerId: peerA,
          registrar: registrarA
        }, {
          peerId: peerB,
          registrar: registrarB
        })

        // wait for remoteLibp2p to know about libp2p subscription
        await pWaitFor(() => {
          const subscribedPeers = psB.getSubscribers(topic)
          return subscribedPeers.toString().includes(peerA.toString())
        })

        void psB.dispatchEvent(new CustomEvent(topic, { detail: data }))

        await defer2.promise
      })

      it.skip('should handle quick reconnects with a delayed disconnect', async () => {
        // Subscribe on both
        let aReceivedFirstMessageFromB = false
        let aReceivedSecondMessageFromB = false
        let bReceivedFirstMessageFromA = false
        let bReceivedSecondMessageFromA = false

        const handlerSpyA = (evt: CustomEvent<Message>) => {
          const message = evt.detail
          const data = uint8ArrayToString(message.data)

          if (data === 'message-from-b-1') {
            aReceivedFirstMessageFromB = true
          }

          if (data === 'message-from-b-2') {
            aReceivedSecondMessageFromB = true
          }
        }
        const handlerSpyB = (evt: CustomEvent<Message>) => {
          const message = evt.detail
          const data = uint8ArrayToString(message.data)

          if (data === 'message-from-a-1') {
            bReceivedFirstMessageFromA = true
          }

          if (data === 'message-from-a-2') {
            bReceivedSecondMessageFromA = true
          }
        }

        const topic = 'reconnect-channel'

        psA.addEventListener(topic, handlerSpyA)
        psB.addEventListener(topic, handlerSpyB)
        psA.subscribe(topic)
        psB.subscribe(topic)

        // Create two connections to the remote peer
        // @ts-expect-error protected fields
        const originalConnection = await psA._libp2p.dialer.connectToPeer(psB.peerId)

        // second connection
        await connectPeers(psA.multicodecs[0], {
          peerId: peerA,
          registrar: registrarA
        }, {
          peerId: peerB,
          registrar: registrarB
        })

        // Wait for subscriptions to occur
        await pWaitFor(() => {
          return psA.getSubscribers(topic).includes(peerB) &&
            psB.getSubscribers(topic).map(p => p.toString()).includes(peerA.toString())
        })

        // Verify messages go both ways
        void psA.dispatchEvent(new CustomEvent(topic, { detail: uint8ArrayFromString('message-from-a-1') }))
        void psB.dispatchEvent(new CustomEvent(topic, { detail: uint8ArrayFromString('message-from-b-1') }))
        await pWaitFor(() => {
          return aReceivedFirstMessageFromB && bReceivedFirstMessageFromA
        })

        // Disconnect the first connection (this acts as a delayed reconnect)
        // @ts-expect-error protected fields
        const psAConnUpdateSpy = sinon.spy(psA._libp2p.connectionManager.connections, 'set')

        await originalConnection.close()
        await pWaitFor(() => psAConnUpdateSpy.callCount === 1)

        // Verify messages go both ways after the disconnect
        void psA.dispatchEvent(new CustomEvent(topic, { detail: uint8ArrayFromString('message-from-a-2') }))
        void psB.dispatchEvent(new CustomEvent(topic, { detail: uint8ArrayFromString('message-from-b-2') }))
        await pWaitFor(() => {
          return aReceivedSecondMessageFromB && bReceivedSecondMessageFromA
        })
      })
    })
  })
}
