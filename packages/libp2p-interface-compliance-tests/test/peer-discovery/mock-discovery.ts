import { Multiaddr } from '@multiformats/multiaddr'
import * as PeerIdFactory from '@libp2p/peer-id-factory'
import { EventEmitter, CustomEvent } from '@libp2p/interfaces'
import type { PeerDiscovery, PeerDiscoveryEvents } from '@libp2p/interfaces/peer-discovery'

interface MockDiscoveryOptions {
  discoveryDelay?: number
}

/**
 * Emits 'peer' events on discovery.
 */
export class MockDiscovery extends EventEmitter<PeerDiscoveryEvents> implements PeerDiscovery {
  public readonly options: MockDiscoveryOptions
  private _isRunning: boolean
  private _timer: any

  constructor (options = {}) {
    super()

    this.options = options
    this._isRunning = false
  }

  start () {
    this._isRunning = true
    this._discoverPeer()
  }

  stop () {
    clearTimeout(this._timer)
    this._isRunning = false
  }

  isStarted () {
    return this._isRunning
  }

  _discoverPeer () {
    if (!this._isRunning) return

    PeerIdFactory.createEd25519PeerId()
      .then(peerId => {
        this._timer = setTimeout(() => {
          this.dispatchEvent(new CustomEvent('peer', {
            detail: {
              id: peerId,
              multiaddrs: [new Multiaddr('/ip4/127.0.0.1/tcp/8000')],
              protocols: []
            }
          }))
        }, this.options.discoveryDelay ?? 1000)
      })
      .catch(() => {})
  }
}
